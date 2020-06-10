import {
  assertUnreachable,
  ICeloAccountSnapshot,
  NetworkDefinition,
} from "@anthem/utils";
import * as Sentry from "@sentry/browser";
import { FiatCurrency } from "constants/fiat";
import {
  CeloAccountHistoryProps,
  FiatPriceHistoryProps,
  GraphQLConfigProps,
  withCeloAccountHistory,
  withFiatPriceHistory,
  withGraphQLVariables,
} from "graphql/queries";
import * as Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { PORTFOLIO_CHART_TYPES } from "i18n/english";
import Modules, { ReduxStoreState } from "modules/root";
import { i18nSelector } from "modules/settings/selectors";
import React from "react";
import { connect } from "react-redux";
import { RouteComponentProps, withRouter } from "react-router";
import { ChartData, getHighchartsChartOptions } from "tools/chart-utils";
import {
  capitalizeString,
  getFiatPriceHistoryMap,
  PriceHistoryMap,
} from "tools/client-utils";
import { composeWithProps } from "tools/context-utils";
import { denomToUnit } from "tools/currency-utils";
import { toDateKeyCelo } from "tools/date-utils";
import { GraphQLGuardComponent } from "ui/GraphQLGuardComponents";
import { DashboardError } from "ui/pages/DashboardPage";
import Toast from "ui/Toast";
import CurrencySettingsToggle from "../CurrencySettingToggle";
import { Button, DashboardLoader, Row, View } from "../SharedComponents";

/** ===========================================================================
 * React Component
 * ============================================================================
 */

class CeloPortfolio extends React.PureComponent<
  IProps,
  { displayLoadingMessage: boolean }
> {
  loadingTimer: Nullable<number> = null;
  chartRef: any = null;

  constructor(props: IProps) {
    super(props);

    this.state = {
      displayLoadingMessage: false,
    };
  }

  componentDidMount() {
    if (this.props.celoAccountHistory.loading) {
      this.startLoadingTimer();
    }
  }

  componentWillUnmount() {
    this.cancelLoadingTimer();
  }

  componentDidUpdate() {
    if (this.props.celoAccountHistory.loading) {
      this.startLoadingTimer();
    }

    if (!this.props.celoAccountHistory.loading) {
      this.cancelLoadingTimer();
    }
  }

  render(): JSX.Element {
    const { displayLoadingMessage } = this.state;
    const {
      app,
      i18n,
      settings,
      network,
      fullSize,
      celoAccountHistory,
    } = this.props;
    const { t, tString } = i18n;
    const { fiatCurrency, currencySetting, isDarkTheme } = settings;

    // console.log("CELO account history:");
    // console.log(celoAccountHistory);

    return (
      <View style={{ position: "relative", height: "100%" }}>
        <GraphQLGuardComponent
          tString={tString}
          dataKey="celoAccountHistory"
          result={celoAccountHistory}
          errorComponent={<DashboardError tString={tString} />}
          loadingComponent={
            <DashboardLoader
              showPortfolioLoadingMessage={displayLoadingMessage}
            />
          }
        >
          {(accountHistory: ICeloAccountSnapshot[]) => {
            const getChartOptions = (
              type: PORTFOLIO_CHART_TYPES,
            ): Nullable<Highcharts.Options> => {
              const chartData = getChartData(accountHistory, network, type);
              if (chartData) {
                return getHighchartsChartOptions({
                  tString,
                  network,
                  fullSize,
                  chartData,
                  isDarkTheme,
                  fiatCurrency,
                  currencySetting,
                });
              }

              return null;
            };

            const noData = accountHistory.length === 0;

            if (noData) {
              return (
                <View style={{ paddingTop: 110 }}>
                  <p style={{ margin: 0, textAlign: "center" }}>
                    {t("No data exists yet.")}
                  </p>
                </View>
              );
            }

            const options = getChartOptions(app.activeChartTab);

            if (!options) {
              return (
                <View style={{ paddingTop: 110 }}>
                  <p style={{ margin: 0, textAlign: "center" }}>
                    {capitalizeString(app.activeChartTab)} account history is
                    not supported yet for Oasis.
                  </p>
                </View>
              );
            }

            return (
              <View>
                <Row style={{ justifyContent: "space-between" }}>
                  {this.props.settings.isDesktop && (
                    <Button
                      category="SECONDARY"
                      data-cy="csv-download-button"
                      onClick={() => this.handleDownloadCSV(accountHistory)}
                    >
                      {i18n.t("Download CSV")}
                    </Button>
                  )}
                  <View>
                    <CurrencySettingsToggle />
                  </View>
                </Row>
                <HighchartsReact
                  options={options}
                  highcharts={Highcharts}
                  ref={this.assignChartRef}
                />
              </View>
            );
          }}
        </GraphQLGuardComponent>
      </View>
    );
  }

  startLoadingTimer = () => {
    const LOADING_THRESHOLD_DELAY = 3000; // 3 seconds
    this.loadingTimer = setTimeout(() => {
      this.setState({ displayLoadingMessage: true });
    }, LOADING_THRESHOLD_DELAY);
  };

  cancelLoadingTimer = () => {
    if (this.loadingTimer) {
      clearTimeout(this.loadingTimer);
    }

    this.setState({ displayLoadingMessage: false });
  };

  assignChartRef = (ref: any) => {
    this.chartRef = ref;
  };

  handleDownloadCSV = (accountHistory: ICeloAccountSnapshot[]) => {
    try {
      const { fiatPriceHistory } = this.props.fiatPriceHistory;
      const format = "DD-MM-YYYY";
      const priceHistory = getFiatPriceHistoryMap(fiatPriceHistory, format);
      const data = getCeloCSV(
        this.props.address,
        accountHistory,
        this.props.network,
        this.props.settings.fiatCurrency,
        priceHistory,
      );
      this.props.downloadDataToFile(data);
    } catch (err) {
      Sentry.captureException(err);
      Toast.warn("Failed to download account history...");
    }
  };
}

/** ===========================================================================
 * Utils
 * ============================================================================
 */

// NOTE: Celo Snapshot Data:
// "snapshotDate": "07-04-2020",
// "address": "0x91E317a5437c0AFD7c99BfC9c120927131Cda2D2",
// "height": "0",
// "snapshotReward": "0",
// "availableGoldBalance": "0",
// "totalLockedGoldBalance": "0",
// "nonVotingLockedGoldBalance": "0",
// "votingLockedGoldBalance": "0",
// "pendingWithdrawalBalance": "0",
// "celoUSDValue": "0",
// "delegations": []

/**
 * Function to build the Oasis chart data. Currently available is the only
 * chart which is supported.
 */
const getChartData = (
  accountHistory: ICeloAccountSnapshot[],
  network: NetworkDefinition,
  type: PORTFOLIO_CHART_TYPES,
): Nullable<ChartData> => {
  const series: { [key: string]: number } = {};

  for (const x of accountHistory) {
    let value = "";
    switch (type) {
      case "TOTAL":
        value = x.totalLockedGoldBalance;
        break;
      case "AVAILABLE":
        value = x.availableGoldBalance;
        break;
      case "REWARDS":
        value = x.snapshotReward;
        break;
      case "STAKING":
        value = x.totalLockedGoldBalance;
        break;
      case "COMMISSIONS":
        // Commissions are not supported yet
        return null;
      default:
        console.warn(`Unexpected activeChartTab received: ${type}`);
        assertUnreachable(type);
    }

    const key = toDateKeyCelo(x.snapshotDate);
    series[key] = denomToUnit(value, network.denominationSize, Number);
  }

  return {
    type,
    data: series,
    withdrawalsMap: {},
    withdrawalEventDates: {},
  };
};

/**
 * Function to build the Celo CSV export.
 */
const getCeloCSV = (
  address: string,
  accountHistory: ICeloAccountSnapshot[],
  network: NetworkDefinition,
  fiatCurrencySymbol: FiatCurrency,
  fiatPriceHistory: PriceHistoryMap,
) => {
  const coin = network.descriptor;

  // Create the CSV Header.
  const CSV_HEADERS: string[] = [
    "Date",
    `Exchange Rate (${fiatCurrencySymbol.symbol}:${coin})`,
    `Available Gold Balance (${coin})`,
    `Total Locked Gold Balance (${coin})`,
    `Non Voting Locked Gold Balance (${coin})`,
    `Voting Locked Gold Balance (${coin})`,
    `Pending Withdrawal Balance (${coin})`,
    `Reward (${coin})`,
    `cUSD Balance (${coin})`,
  ];

  // Add info text about the address and network
  const ADDRESS_INFO = `Account history data for ${network.name} address ${address}.\n\n`;

  // Add disclaimer at the top of the CSV:
  const DISCLAIMER = `[DISCLAIMER]: This CSV account history is a best approximation of the account balances and rewards data over time. It is not a perfect history and uses a 3rd party price feed for exchange price data.\n\n`;

  // Assemble CSV file string with headers
  let CSV = `${ADDRESS_INFO}${DISCLAIMER}${CSV_HEADERS.join(",")}\n`;

  for (const snapshot of accountHistory) {
    const {
      snapshotDate,
      snapshotReward,
      availableGoldBalance,
      totalLockedGoldBalance,
      nonVotingLockedGoldBalance,
      votingLockedGoldBalance,
      pendingWithdrawalBalance,
      celoUSDValue,
    } = snapshot;

    const size = network.denominationSize;
    const dateKey = toDateKeyCelo(snapshotDate, true);
    const exchangeRate = fiatPriceHistory[snapshotDate] || "n/a";
    const available = denomToUnit(availableGoldBalance, size, String);
    const totalLocked = denomToUnit(totalLockedGoldBalance, size, String);
    const nonVoting = denomToUnit(nonVotingLockedGoldBalance, size, String);
    const voting = denomToUnit(votingLockedGoldBalance, size, String);
    const pending = denomToUnit(pendingWithdrawalBalance, size, String);
    const reward = denomToUnit(snapshotReward, size, String);
    const cUSD = denomToUnit(celoUSDValue, size, String);

    // Create the CSV row
    const row = [
      dateKey,
      exchangeRate,
      dateKey,
      available,
      totalLocked,
      nonVoting,
      voting,
      pending,
      reward,
      cUSD,
    ].join(",");

    // Add the row to the CSV
    CSV += `${row}\n`;
  }

  return CSV;
};

/** ===========================================================================
 * Props
 * ============================================================================
 */

const mapStateToProps = (state: ReduxStoreState) => ({
  i18n: i18nSelector(state),
  settings: Modules.selectors.settings(state),
  app: Modules.selectors.app.appSelector(state),
  network: Modules.selectors.ledger.networkSelector(state),
  address: Modules.selectors.ledger.addressSelector(state),
});

const dispatchProps = {
  updateSetting: Modules.actions.settings.updateSetting,
};

const withProps = connect(mapStateToProps, dispatchProps);

type ConnectProps = ReturnType<typeof mapStateToProps> & typeof dispatchProps;

interface ComponentProps {
  fullSize: boolean;
  downloadDataToFile: (CSV: string) => void;
}

interface IProps
  extends ComponentProps,
    ConnectProps,
    RouteComponentProps,
    GraphQLConfigProps,
    CeloAccountHistoryProps,
    FiatPriceHistoryProps {}

/** ===========================================================================
 * Export
 * ============================================================================
 */

export default composeWithProps<ComponentProps>(
  withRouter,
  withProps,
  withGraphQLVariables,
  withFiatPriceHistory,
  withCeloAccountHistory,
)(CeloPortfolio);
