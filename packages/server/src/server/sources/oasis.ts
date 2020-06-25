import {
  assertUnreachable,
  IOasisAccountBalances,
  IOasisTransaction,
  IOasisTransactionType,
  IQuery,
  NetworkDefinition,
} from "@anthem/utils";
import { logSentryMessage } from "../../tools/server-utils";
import { AxiosUtil, getHostFromNetworkName } from "../axios-utils";
import { PaginationParams } from "../resolvers/resolvers";

/** ===========================================================================
 * Types & Config
 * ----------------------------------------------------------------------------
 * Reference:
 * - https://github.com/ChorusOne/Hippias/blob/master/pkg/oasis/types.go
 * ============================================================================
 */

interface OasisDelegation {
  delegator: string;
  validator: string;
  amount: string;
}

interface Balance {
  balance: string;
  shares: string;
}

interface OasisAccountResponse {
  height: number;
  address: string;
  balance: string;
  staked_balance: Balance;
  debonding_balance: Balance;
  delegations: OasisDelegation[];
  meta: AccountMeta;
}

interface OasisAccountHistory {
  date: string;
  height: number;
  address: string;
  balance: string;
  staked_balance: Balance;
  debonding_balance: Balance;
  delegations: OasisDelegation[];
  meta: AccountMeta;
}

interface AccountMeta {
  is_validator: boolean;
  is_delegator: boolean;
}

enum OasisTransactionMethod {
  TRANSFER = "staking.Transfer",
  BURN = "staking.Burn",
  ADD_ESCROW = "staking.AddEscrow",
  RECLAIM_ESCROW = "staking.ReclaimEscrow",
  TAKE_ESCROW = "staking.TakeEscrow",
  REGISTER_ENTITY = "staking.RegisterEntity",
  REGISTER_NODE = "registry.RegisterNode",
  DE_REGISTER_ENTITY = "staking.DeregisterEntity",
  UN_FREEZE_NODE = "staking.UnfreezeNode",
  RATE = "staking.Rate",
  BOUND = "staking.Bound",
  REGISTER_RUNTIME = "staking.RegisterRuntime",
  AMEND_COMMISSION_SCHEDULE = "staking.AmendCommissionSchedule",
  UNKNOWN_METHOD = "UnknownMethod",
}

interface OasisTransactionBase {
  hash: string;
  fee: string;
  gas: number;
  gas_price: string;
  height: number;
  sender: string;
  method: OasisTransactionMethod;
  date: string;
}

interface TxTransfer extends OasisTransactionBase {
  method: OasisTransactionMethod.TRANSFER;
  data: {
    from: string;
    to: string;
    tokens: string;
  };
}

interface TxAddEscrow extends OasisTransactionBase {
  method: OasisTransactionMethod.ADD_ESCROW;
  data: {
    to: string;
    tokens: string;
  };
}

interface TxTakeEscrow extends OasisTransactionBase {
  method: OasisTransactionMethod.TAKE_ESCROW;
  data: {
    from: string;
    to: string;
    tokens: string;
  };
}

interface TxReclaimEscrow extends OasisTransactionBase {
  method: OasisTransactionMethod.RECLAIM_ESCROW;
  data: {
    from: string;
    shares: string;
  };
}

interface TxBurn extends OasisTransactionBase {
  method: OasisTransactionMethod.BURN;
  data: {
    owner: string;
    tokens: string;
  };
}

interface TxRegisterNode extends OasisTransactionBase {
  method: OasisTransactionMethod.REGISTER_NODE;
  data: {
    id: string;
    entity_id: string;
    expiration: number;
  };
}

interface TxRegisterEntity extends OasisTransactionBase {
  method: OasisTransactionMethod.REGISTER_ENTITY;
  data: {
    id: string;
    nodes: string[];
    allow_entity_signed_nodes: boolean;
  };
}

interface TxDeregisterEntity extends OasisTransactionBase {
  method: OasisTransactionMethod.DE_REGISTER_ENTITY;
  data: {
    id: string;
    nodes: string[];
    allow_entity_signed_nodes: boolean;
  };
}

interface TxUnfreezeNode extends OasisTransactionBase {
  method: OasisTransactionMethod.UN_FREEZE_NODE;
  data: {
    id: string;
  };
}

interface TxRate extends OasisTransactionBase {
  method: OasisTransactionMethod.RATE;
  data: {
    start: string;
    rate: string;
  };
}

interface TxBound extends OasisTransactionBase {
  method: OasisTransactionMethod.BOUND;
  data: {
    start: string;
    rate_min: string;
    rate_max: string;
  };
}

interface TxRegisterRuntime extends OasisTransactionBase {
  method: OasisTransactionMethod.REGISTER_RUNTIME;
  data: {
    id: string;
    version: string;
  };
}

interface TxAmendCommissionSchedule extends OasisTransactionBase {
  method: OasisTransactionMethod.AMEND_COMMISSION_SCHEDULE;
  data: {
    rates: string[];
    bounds: string[];
  };
}

interface TxUnknownMethod extends OasisTransactionBase {
  method: OasisTransactionMethod.UNKNOWN_METHOD;
  data: {
    method_name: string;
  };
}

type OasisTransaction =
  | TxBurn
  | TxTransfer
  | TxAddEscrow
  | TxTakeEscrow
  | TxReclaimEscrow
  | TxRegisterNode
  | TxRegisterEntity
  | TxDeregisterEntity
  | TxUnfreezeNode
  | TxRate
  | TxBound
  | TxRegisterRuntime
  | TxAmendCommissionSchedule
  | TxUnknownMethod;

/** ===========================================================================
 * Oasis REST API Utils
 * ----------------------------------------------------------------------------
 * This file contains the utils for fetching Oasis Network data.
 * ============================================================================
 */

/**
 * Fetch Oasis account balances.
 */
const fetchAccountBalances = async (
  address: string,
  network: NetworkDefinition,
): Promise<IOasisAccountBalances> => {
  const host = getHostFromNetworkName(network.name);
  const response = await AxiosUtil.get<OasisAccountResponse>(
    `${host}/account/${address}`,
  );

  const {
    meta,
    balance,
    staked_balance,
    debonding_balance,
    delegations,
  } = response;

  const balances = {
    available: balance,
    staked: staked_balance,
    unbonding: debonding_balance,
    rewards: "0",
    commissions: "0",
    meta,
    delegations,
  };

  return balances;
};

/**
 * Fetch account history.
 */
const fetchAccountHistory = async (
  address: string,
  network: NetworkDefinition,
): Promise<IQuery["oasisAccountHistory"]> => {
  const host = getHostFromNetworkName(network.name);
  const url = `${host}/account/${address}/history`;
  const response = await AxiosUtil.get<OasisAccountHistory[]>(url);
  return response;
};

/**
 * Fetch transaction history.
 */
const fetchTransactions = async (
  args: PaginationParams,
): Promise<IQuery["oasisTransactions"]> => {
  const { address, network, startingPage, pageSize } = args;
  const host = getHostFromNetworkName(network.name);
  const params = `limit=${pageSize + 1}&page=${startingPage}`;
  const url = `${host}/account/${address}/transactions?${params}`;
  const response = await AxiosUtil.get<OasisTransaction[]>(url);
  // const response = MOCK_OASIS_EVENTS;

  const pages = Array.isArray(response) ? response.slice(0, pageSize) : [];
  const moreResultsExist = response.length > pageSize;

  // Transform the response data
  const convertedTransactions = pages
    .map(x => adaptOasisTransaction(x, address))
    .filter(x => x !== null) as IOasisTransaction[];

  return {
    limit: pageSize,
    page: startingPage,
    moreResultsExist,
    data: convertedTransactions,
  };
};

/**
 * Fetch a transaction by hash.
 */
const fetchTransaction = async (hash: string): Promise<IOasisTransaction> => {
  const host = getHostFromNetworkName("OASIS");
  const url = `${host}/transaction?hash=${hash}`;
  const response = await AxiosUtil.get<OasisTransaction>(url);

  if (!response) {
    throw new Error(`No transaction found for hash: ${hash}`);
  }

  const result = adaptOasisTransaction(response, "");
  if (result) {
    return result;
  } else {
    throw new Error(`No transaction found for hash: ${hash}`);
  }
};

/** ===========================================================================
 * Utils
 * ============================================================================
 */

// Generate a random hash for now.
const getRandomHash = () => {
  const x = () =>
    Math.random()
      .toString(36)
      .substring(7);

  return `${x()}${x()}${x()}${x()}`;
};

/**
 * Map the transaction type onto the transaction data.
 */
const combineWithType = (
  transaction: OasisTransaction,
  type: IOasisTransactionType,
) => {
  const result: IOasisTransaction = {
    ...transaction,
    // @ts-ignore
    data: { ...transaction.data, type },
  };

  return result;
};

/**
 * Transform the original transaction records to match the GraphQL schema
 * definition.
 */
const adaptOasisTransaction = (
  tx: OasisTransaction,
  address: string,
): IOasisTransaction | null => {
  const { method } = tx;

  switch (method) {
    case OasisTransactionMethod.TRANSFER: {
      return combineWithType(tx, IOasisTransactionType.Transfer);
    }
    case OasisTransactionMethod.ADD_ESCROW: {
      return combineWithType(tx, IOasisTransactionType.EscrowAdd);
    }
    case OasisTransactionMethod.RECLAIM_ESCROW: {
      return combineWithType(tx, IOasisTransactionType.EscrowReclaim);
    }
    case OasisTransactionMethod.TAKE_ESCROW: {
      return combineWithType(tx, IOasisTransactionType.EscrowTake);
    }
    case OasisTransactionMethod.BURN: {
      return combineWithType(tx, IOasisTransactionType.Burn);
    }
    case OasisTransactionMethod.REGISTER_NODE: {
      return combineWithType(tx, IOasisTransactionType.RegisterNode);
    }
    case OasisTransactionMethod.REGISTER_ENTITY: {
      return combineWithType(tx, IOasisTransactionType.RegisterEntity);
    }
    case OasisTransactionMethod.DE_REGISTER_ENTITY: {
      return null;
    }
    case OasisTransactionMethod.UN_FREEZE_NODE: {
      return combineWithType(tx, IOasisTransactionType.UnfreezeNode);
    }
    case OasisTransactionMethod.RATE: {
      return combineWithType(tx, IOasisTransactionType.RateEvent);
    }
    case OasisTransactionMethod.BOUND: {
      return combineWithType(tx, IOasisTransactionType.BoundEvent);
    }
    case OasisTransactionMethod.REGISTER_RUNTIME: {
      return combineWithType(tx, IOasisTransactionType.RegisterRuntime);
    }
    case OasisTransactionMethod.AMEND_COMMISSION_SCHEDULE: {
      return combineWithType(tx, IOasisTransactionType.AmendCommissionSchedule);
    }
    case OasisTransactionMethod.UNKNOWN_METHOD: {
      return combineWithType(tx, IOasisTransactionType.UnknownEvent);
    }

    default: {
      // Unrecognized transaction data:
      logSentryMessage(
        `Unrecognized Oasis transaction received for address ${address}. Original transaction data: ${JSON.stringify(
          tx,
        )}`,
      );
      return assertUnreachable(method);
    }
  }
};

/** ===========================================================================
 * Mock Transactions for Testing
 * ============================================================================
 */

const txBase = {
  fee: "1",
  gas_price: "0",
  gas: 1000,
  sender: "Xk9WLxZWcLjef1BZQD2PSpgapW5zBvPO1H8lZgkEUWU=",
  date: "2020-05-11T21:35:24Z",
  height: 2547,
};

const deregister: TxDeregisterEntity = {
  ...txBase,
  method: OasisTransactionMethod.DE_REGISTER_ENTITY,
  hash: getRandomHash(),
  data: {
    id: "sa8df70af7as0",
    nodes: ["sa980df7a0", "sa9d67f89a", "as9df76sa9"],
    allow_entity_signed_nodes: true,
  },
};

const register: TxRegisterEntity = {
  ...txBase,
  method: OasisTransactionMethod.REGISTER_ENTITY,
  hash: getRandomHash(),
  data: {
    id: "sa8df70af7as0",
    nodes: ["sa980df7a0", "sa9d67f89a", "as9df76sa9"],
    allow_entity_signed_nodes: true,
  },
};

const rateEvent: TxRate = {
  ...txBase,
  method: OasisTransactionMethod.RATE,
  hash: getRandomHash(),
  data: {
    start: "Start",
    rate: "Rate",
  },
};

const amend: TxAmendCommissionSchedule = {
  ...txBase,
  method: OasisTransactionMethod.AMEND_COMMISSION_SCHEDULE,
  hash: getRandomHash(),
  data: {
    rates: ["1", "2", "3"],
    bounds: ["1", "2", "3"],
  },
};

const registerRuntime: TxRegisterRuntime = {
  ...txBase,
  method: OasisTransactionMethod.REGISTER_RUNTIME,
  hash: getRandomHash(),
  data: {
    id: "as9fd7as97f6sad0",
    version: "1.2.4",
  },
};

const boundEvent: TxBound = {
  ...txBase,
  method: OasisTransactionMethod.BOUND,
  hash: getRandomHash(),
  data: {
    start: "Start",
    rate_min: "Rate Min",
    rate_max: "Rate Max",
  },
};

const unfreezeNode: TxUnfreezeNode = {
  ...txBase,
  method: OasisTransactionMethod.UN_FREEZE_NODE,
  hash: getRandomHash(),
  data: {
    id: "s76fd9af9s8ad",
  },
};

const registerNode: TxRegisterNode = {
  ...txBase,
  method: OasisTransactionMethod.REGISTER_NODE,
  hash: getRandomHash(),
  data: {
    id: "s0a9f780sa97f0sad",
    entity_id: "saf967as986f784as67d5f",
    expiration: 15000,
  },
};

const unknown: TxUnknownMethod = {
  ...txBase,
  method: OasisTransactionMethod.UNKNOWN_METHOD,
  hash: getRandomHash(),
  data: {
    method_name: "HEIST",
  },
};

const MOCK_OASIS_EVENTS: OasisTransaction[] = [
  deregister,
  register,
  rateEvent,
  amend,
  registerRuntime,
  boundEvent,
  unfreezeNode,
  registerNode,
  unknown,
];

/** ===========================================================================
 * Export
 * ============================================================================
 */

const OASIS = {
  fetchAccountBalances,
  fetchAccountHistory,
  fetchTransactions,
  fetchTransaction,
};

export default OASIS;
