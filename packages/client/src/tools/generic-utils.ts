import {
  assertUnreachable,
  COIN_DENOMS,
  getValidatorAddressFromDelegatorAddress,
  IBalance,
  IDelegation,
  IQuery,
  IUnbondingDelegationEntry,
  IValidator,
  NETWORK_NAME,
  NetworkDefinition,
} from "@anthem/utils";
import { ApolloError } from "apollo-client";
import BigNumber from "bignumber.js";
import { AvailableReward } from "components/CreateTransactionForm";
import Toast from "components/Toast";
import { PORTFOLIO_CHART_TYPES } from "i18n/english";
import queryString, { ParsedQuery } from "query-string";
import {
  convertAtomsToFiat,
  denomToAtoms,
  formatCurrencyAmount,
} from "./currency-utils";
import { formatFiatPriceDate } from "./date-utils";
import { isGreaterThanOrEqualTo } from "./math-utils";

/** ===========================================================================
 * Types & Config
 * ============================================================================
 */

// Reference: https://cosmos.network/docs/spec/addresses/bech32.html
export enum COSMOS_ADDRESS_ENUM {
  ACCOUNT_ADDRESS = "cosmos",
  ACCOUNT_PUBLIC_KEY = "cosmospub",
  VALIDATOR_OPERATOR_ADDRESS = "cosmosvaloper",
  VALIDATOR_CONSENSUS_ADDRESS = "cosmosvalcons",
  VALIDATOR_CONSENSUS_PUBLIC_KEY = "cosmosvalconspub",
  VALIDATOR_OPERATOR_PUBLIC_KEY = "cosmosvaloperpub",
}

export enum KAVA_ADDRESS_ENUM {
  ACCOUNT_ADDRESS = "kava",
  ACCOUNT_PUBLIC_KEY = "kavapub",
  VALIDATOR_OPERATOR_ADDRESS = "kavavaloper",
  VALIDATOR_CONSENSUS_ADDRESS = "kavavalcons",
  VALIDATOR_CONSENSUS_PUBLIC_KEY = "kavavalconspub",
  VALIDATOR_OPERATOR_PUBLIC_KEY = "kavavaloperpub",
}

export enum TERRA_ADDRESS_ENUM {
  ACCOUNT_ADDRESS = "terra",
  ACCOUNT_PUBLIC_KEY = "terrapub",
  VALIDATOR_OPERATOR_ADDRESS = "terravaloper",
  VALIDATOR_CONSENSUS_ADDRESS = "terravalcons",
  VALIDATOR_CONSENSUS_PUBLIC_KEY = "terravalconspub",
  VALIDATOR_OPERATOR_PUBLIC_KEY = "terravaloperpub",
}

// TODO: Implement
export enum OASIS_ADDRESS_ENUM {
  ACCOUNT_ADDRESS = "",
  ACCOUNT_PUBLIC_KEY = "",
  VALIDATOR_OPERATOR_ADDRESS = "",
  VALIDATOR_CONSENSUS_ADDRESS = "",
  VALIDATOR_CONSENSUS_PUBLIC_KEY = "",
  VALIDATOR_OPERATOR_PUBLIC_KEY = "",
}

/** =======================================================
 * Common Util Helper Methods
 * ========================================================
 */

/**
 * Determine if a given route link is on the current active route.
 */
export const onActiveRoute = (pathName: string, routeName: string) => {
  return pathName.toLowerCase().includes(routeName.toLowerCase());
};

/**
 * Identity function.
 */
export const identity = <T extends {}>(x: T): T => x;

/**
 * Parse the query parameters from the current url.
 */
export const getQueryParamsFromUrl = (paramString: string) => {
  // TODO: How to handle Oasis addresses?
  const addressSlice = paramString.replace("?address=", "");
  const oasisProxy = addressSlice.length === 44;
  if (oasisProxy) {
    const result = { address: addressSlice };
    return result as ParsedQuery<string>;
  }

  return queryString.parse(paramString);
};

/**
 * Helper to return the block explorer URL for a transaction.
 */
export const getBlockExplorerUrlForTransaction = (
  hash: string,
  network: NETWORK_NAME,
) => {
  switch (network) {
    case "COSMOS":
      return `https://www.mintscan.io/txs/${hash}`;
    case "KAVA":
      return `https://kava.mintscan.io/txs/${hash}`;
    case "TERRA":
      return `https://terra.stake.id/?#/tx/${hash}`;
    case "OASIS":
      console.warn("[TODO]: Implement Block Explorer url for Oasis");
      return "";
    default:
      return assertUnreachable(network);
  }
};

/**
 * Find a denom `IBalance` in a list of balances. The denom may not exist.
 */
const findDenomsInList = (
  denom: COIN_DENOMS,
  list: Maybe<ReadonlyArray<IBalance>>,
): Nullable<ReadonlyArray<IBalance>> => {
  if (!list) {
    return null;
  }

  const result = list.filter(balance => balance.denom === denom);

  if (result) {
    return result;
  } else {
    return null;
  }
};

/**
 * Aggregate multiple values in a list and add them up.
 */
const aggregateCurrencyValuesFromList = <T>(
  balances: ReadonlyArray<T>,
  key: keyof T,
) => {
  return balances.reduce((sum, balance) => {
    // The field may be nullable, hence defaulting to 0:
    return sum.plus(new BigNumber(`${balance[key] || 0}`));
  }, new BigNumber(0));
};

interface AccountBalancesResult {
  balance: string;
  rewards: string;
  delegations: string;
  unbonding: string;
  commissions: string;
  total: string;
  balanceUSD: string;
  delegationsUSD: string;
  rewardsUSD: string;
  unbondingUSD: string;
  commissionsUSD: string;
  totalUSD: string;
  percentages: ReadonlyArray<number>;
}
/**
 * Parse the account balances data and return string balance
 * values for all the address balances.
 */
export const getAccountBalances = (
  accountBalancesData: IQuery["accountBalances"] | undefined,
  atomsConversionRate: IQuery["prices"] | undefined,
  denom: COIN_DENOMS,
  maximumFractionDigits?: number,
): AccountBalancesResult => {
  const defaultResult = {
    balance: "",
    rewards: "",
    delegations: "",
    unbonding: "",
    commissions: "",
    total: "",
    balanceUSD: "",
    delegationsUSD: "",
    rewardsUSD: "",
    unbondingUSD: "",
    commissionsUSD: "",
    totalUSD: "",
    percentages: [],
  };

  if (!accountBalancesData || !atomsConversionRate) {
    return defaultResult;
  }

  const data = accountBalancesData;

  if (!data) {
    return defaultResult;
  }

  let balanceResult = new BigNumber("0");
  let rewardsResult = new BigNumber("0");
  let delegationResult = new BigNumber("0");
  let unbondingResult = new BigNumber("0");
  let commissionsResult = new BigNumber("0");

  const atomsBalance = findDenomsInList(denom, data.balance);
  if (atomsBalance) {
    balanceResult = aggregateCurrencyValuesFromList(atomsBalance, "amount");
  }

  const rewardsBalance = findDenomsInList(denom, data.rewards);
  if (rewardsBalance) {
    rewardsResult = aggregateCurrencyValuesFromList(rewardsBalance, "amount");
  }

  if (data.delegations) {
    delegationResult = aggregateCurrencyValuesFromList<IDelegation>(
      data.delegations,
      "shares",
    );
  }

  if (data.unbonding) {
    const unbondingBalances = data.unbonding.reduce(
      (entries: ReadonlyArray<IUnbondingDelegationEntry>, x) => {
        return entries.concat(x.entries);
      },
      [],
    );

    unbondingResult = aggregateCurrencyValuesFromList<
      IUnbondingDelegationEntry
    >(unbondingBalances, "balance");
  }

  if (data.commissions) {
    commissionsResult = aggregateCurrencyValuesFromList(
      data.commissions,
      "amount",
    );
  }

  const totalResult = balanceResult
    .plus(rewardsResult)
    .plus(delegationResult)
    .plus(unbondingResult)
    .plus(commissionsResult);

  const [
    balance,
    rewards,
    delegations,
    unbonding,
    commissions,
    total,
    balanceUSD,
    delegationsUSD,
    rewardsUSD,
    unbondingUSD,
    commissionsUSD,
    totalUSD,
  ]: ReadonlyArray<string> = [
    denomToAtoms(balanceResult, String),
    denomToAtoms(rewardsResult, String),
    denomToAtoms(delegationResult, String),
    denomToAtoms(unbondingResult, String),
    denomToAtoms(commissionsResult, String),
    denomToAtoms(totalResult, String),
    convertAtomsToFiat(atomsConversionRate, balanceResult),
    convertAtomsToFiat(atomsConversionRate, delegationResult),
    convertAtomsToFiat(atomsConversionRate, rewardsResult),
    convertAtomsToFiat(atomsConversionRate, unbondingResult),
    convertAtomsToFiat(atomsConversionRate, commissionsResult),
    convertAtomsToFiat(atomsConversionRate, totalResult),
  ].map(x => formatCurrencyAmount(x, maximumFractionDigits));

  const getPercentage = (value: BigNumber) => {
    return value
      .dividedBy(totalResult)
      .multipliedBy(100)
      .toNumber();
  };

  const percentages: ReadonlyArray<number> = [
    getPercentage(balanceResult),
    getPercentage(delegationResult),
    getPercentage(rewardsResult),
    getPercentage(unbondingResult),
    getPercentage(commissionsResult),
  ];

  return {
    balance,
    rewards,
    delegations,
    unbonding,
    commissions,
    total,
    balanceUSD,
    delegationsUSD,
    rewardsUSD,
    unbondingUSD,
    commissionsUSD,
    totalUSD,
    percentages,
  };
};

/**
 * Simple helper to determine if data from a GraphQL query can be rendered or
 * not.
 */
export const canRenderGraphQL = (graphqlProps: {
  data?: any;
  loading: boolean;
  error?: ApolloError;
}): boolean => {
  return !graphqlProps.loading && !graphqlProps.error && graphqlProps.data;
};

/**
 * Crudely determine if some path string is included in the current URL.
 */
export const onPath = (url: string, pathString: string): boolean => {
  return url.includes(pathString);
};

/**
 * Return information on which dashboard tab the user is viewing from the
 * given url location.
 */
export const getPortfolioTypeFromUrl = (
  path: string,
): PORTFOLIO_CHART_TYPES | null => {
  if (onPath(path, "/total")) {
    return "TOTAL";
  } else if (onPath(path, "/available")) {
    return "AVAILABLE";
  } else if (onPath(path, "/rewards")) {
    return "REWARDS";
  } else if (onPath(path, "/staking")) {
    return "STAKING";
  } else if (onPath(path, "/commissions")) {
    return "COMMISSIONS";
  }

  return null;
};

/**
 * Abbreviate a blockchain address in the typical fashion, e.g.
 * cosmos12az976k62c4qlsfy0tz2ujtw73vvhpqntwenje -> cosmos12...hpqntwenje
 */
export const abbreviateAddress = (
  address: string,
  offset: number = 8,
): string => {
  const endIndex = address.length - offset;
  return `${address.slice(0, 8)}...${address.slice(endIndex)}`;
};

/**
 * Flexibly format an address string and adapt to mobile view.
 */
export const formatAddressString = (
  address: Maybe<string>,
  shouldAbbreviate: boolean,
  endOffset?: number,
): string => {
  if (!address) {
    return "";
  }

  return shouldAbbreviate ? abbreviateAddress(address, endOffset) : address;
};

/**
 * Trim leading zeroes from a string value.
 */
export const trimZeroes = (str: string): string => {
  let result = "";
  let leadingZeroes = str.charAt(str.length - 1) === "0";

  for (let i = str.length - 1; i > -1; i--) {
    const char = str.charAt(i);

    if (char !== "0" || !leadingZeroes) {
      result = str.charAt(i) + result;
      leadingZeroes = false;
    }
  }

  return result;
};

/**
 * Race a promise returning function against a fixed timer.
 */
export const race = async <T extends {}>(
  promiseFn: () => Promise<T>,
  raceTimeout: number = 1500,
  timeoutMessage: string = "race timeout occurred",
) => {
  const timeout = new Promise((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(timeoutMessage);
    }, raceTimeout);
  });

  return Promise.race([promiseFn(), timeout]);
};

export interface PriceHistoryMap {
  [key: string]: string;
}

/**
 * Convert the fiat price history data to a map with date keys.
 */
export const getFiatPriceHistoryMap = (
  fiatPriceHistory: IQuery["fiatPriceHistory"],
): PriceHistoryMap => {
  if (fiatPriceHistory) {
    return fiatPriceHistory.reduce((priceMap, { timestamp, price }) => {
      return {
        ...priceMap,
        [formatFiatPriceDate(timestamp)]: price,
      };
    }, {});
  }

  return {};
};

/**
 * Get the price value from the price history data for a given transaction
 * timestamp.
 */
export const getPriceFromTransactionTimestamp = (
  timestamp: string,
  priceHistory: PriceHistoryMap,
): string => {
  const date = formatFiatPriceDate(new Date(Number(timestamp)));
  if (date in priceHistory) {
    return priceHistory[date];
  }

  return "";
};

export interface ValidatorOperatorAddressMap {
  [key: string]: IValidator;
}

/**
 * Reduce a list of validators to a map keyed by the operator_address for
 * faster lookup.
 */
export const getValidatorOperatorAddressMap = (
  validatorList: ReadonlyArray<IValidator>,
): ValidatorOperatorAddressMap => {
  return validatorList.reduce((addressMap, validator) => {
    return {
      ...addressMap,
      [validator.operator_address]: validator,
    };
  }, {});
};

/**
 * Get a validator name from a delegator address, if a validator exists
 * with that address.
 */
export const getValidatorNameFromAddress = (
  validatorOperatorAddressMap: ValidatorOperatorAddressMap,
  address: string,
  networkName: NETWORK_NAME,
): Nullable<IValidator> => {
  const validatorAddress = getValidatorAddressFromDelegatorAddress(
    address,
    networkName,
  );

  if (validatorAddress && validatorAddress in validatorOperatorAddressMap) {
    const validator = validatorOperatorAddressMap[validatorAddress];
    return validator;
  }

  return null;
};

/**
 * Artificially wait the provided amount of time.
 */
export const wait = async (time: number = 1000) => {
  await new Promise((_: any) => setTimeout(_, time));
};

/**
 * On a failed request the data key became an empty object, rather than
 * `undefined`...???
 *
 * Determine if there is any data present in a response.
 */
export const isGraphQLResponseDataEmpty = (x?: any) => {
  return !Boolean(x) || !Object.keys(x).length;
};

const isChorusOne = (moniker: string) => moniker === "Chorus One";
const isCertusOne = (moniker: string) => moniker === "Certus One";

/**
 * Sort validators list and put Chorus 1st and Certus 2nd. Apply no sorting
 * to the rest of the list.
 */
export const formatValidatorsList = (validators: ReadonlyArray<IValidator>) => {
  if (!validators) {
    return [];
  }

  const reordered = new Array(validators.length);

  for (let i = 0; i < validators.length; i++) {
    const validator = validators[i];
    if (isChorusOne(validator.description.moniker)) {
      reordered[0] = validator;
    } else if (isCertusOne(validator.description.moniker)) {
      reordered[1] = validator;
    } else {
      reordered[i + 2] = validator;
    }
  }

  return reordered;
};

/**
 * Capitalize some string for consistent formatting regardless of the
 * original casing.
 */
export const capitalizeString = (input: string): string => {
  return `${input.charAt(0).toUpperCase()}${input.slice(1).toLowerCase()}`;
};

/**
 * Get all the rewards which are available for withdrawal for a user.
 */
export const mapRewardsToAvailableRewards = (
  rewardsData: IQuery["rewardsByValidator"],
  network: NetworkDefinition,
) => {
  /**
   * Get all the rewards for the selected network denom.
   */
  const availableNetworkRewards = rewardsData
    .filter(x => x.reward !== null)
    .map(reward => {
      // It's not null!
      const denomRewards = reward.reward!.find(r => r.denom === network.denom);
      if (denomRewards) {
        return {
          ...denomRewards,
          validator_address: reward.validator_address,
        };
      }

      return null;
    })
    .filter(Boolean) as ReadonlyArray<AvailableReward>;

  /**
   * Only return rewards greater than 1.
   */
  const availableRewards = availableNetworkRewards.filter(reward =>
    isGreaterThanOrEqualTo(reward.amount, 1),
  );

  return availableRewards;
};

// Copy some text to a clipboard.
// Reference: https://stackoverflow.com/questions/400212/how-do-i-copy-to-the-clipboard-in-javascript
export const copyTextToClipboard = (text: string) => {
  const textArea = document.createElement("textarea");
  textArea.value = text;

  // Avoid scrolling to bottom
  textArea.style.top = "0";
  textArea.style.left = "0";
  textArea.style.position = "fixed";

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand("copy");
    if (!successful) {
      throw new Error("Failed to copy text");
    }

    Toast.success(`Copied ${text} to clipboard.`);
  } catch (err) {
    Toast.danger(`Failed to copy ${text} to clipboard!`);
  }

  document.body.removeChild(textArea);
};

// Format a chain id, e.g. cosmoshub-2 -> Cosmos Hub 2.
// NOTE: This is hard-coded to format cosmos network chain
// ids and will need to be updated to support other networks.
export const justFormatChainString = (chain: string) => {
  const id = chain.slice(-1);
  return `Cosmos Hub ${id}`;
};
