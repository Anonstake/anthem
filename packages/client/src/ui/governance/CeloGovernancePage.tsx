import { ICeloGovernanceProposalHistory } from "@anthem/utils";
import { Card, Code, Collapse, Colors, Elevation, H5 } from "@blueprintjs/core";
import { CopyIcon } from "assets/images";
import { COLORS } from "constants/colors";
import {
  CeloGovernanceProposalsProps,
  withCeloGovernanceProposals,
  withGraphQLVariables,
} from "graphql/queries";
import Modules, { ReduxStoreState } from "modules/root";
import { i18nSelector } from "modules/settings/selectors";
import React from "react";
import { connect } from "react-redux";
import styled from "styled-components";
import {
  convertCeloEpochToTimestamp,
  copyTextToClipboard,
} from "tools/client-utils";
import { composeWithProps } from "tools/context-utils";
import { IThemeProps } from "ui/containers/ThemeContainer";
import { GraphQLGuardComponent } from "ui/GraphQLGuardComponents";
import PageAddressBar from "ui/PageAddressBar";
import {
  DashboardError,
  DashboardLoader,
  Link,
  PageContainerScrollable,
  Row,
  View,
} from "ui/SharedComponents";

/** ===========================================================================
 * Types & Config
 * ============================================================================
 */

interface IState {
  selectedProposalID: Nullable<number>;
}

/** ===========================================================================
 * Celo Governance Page
 * ============================================================================
 */

class CeloGovernancePage extends React.Component<IProps, IState> {
  constructor(props: IProps) {
    super(props);

    this.state = {
      selectedProposalID: null,
    };
  }

  render(): Nullable<JSX.Element> {
    const { selectedProposalID } = this.state;
    const { celoGovernanceProposals, i18n } = this.props;

    return (
      <PageContainerScrollable>
        <PageAddressBar pageTitle="Governance" />
        <GraphQLGuardComponent
          tString={i18n.tString}
          dataKey="celoGovernanceProposals"
          result={celoGovernanceProposals}
          errorComponent={<DashboardError tString={i18n.tString} />}
          loadingComponent={<DashboardLoader />}
        >
          {(proposalHistory: ICeloGovernanceProposalHistory) => {
            const proposals = groupAndSortProposals(proposalHistory);
            console.log(proposalHistory);
            console.log(proposals);
            return (
              <>
                <ProposalsPanel>
                  <Panel>
                    <H5 style={{ margin: 2, paddingLeft: 12 }}>Proposals</H5>
                    <Card
                      elevation={Elevation.TWO}
                      style={{
                        margin: 6,
                        height: 275,
                        padding: 0,
                        borderRadius: 0,
                        overflowY: "scroll",
                      }}
                    >
                      <ProposalBanner>
                        <ProposalTitleText style={{ flex: 1 }}>
                          ID
                        </ProposalTitleText>
                        <ProposalTitleText style={{ flex: 2 }}>
                          STAGE
                        </ProposalTitleText>
                        <ProposalTitleText style={{ flex: 3 }}>
                          TITLE
                        </ProposalTitleText>
                        <ProposalTitleText style={{ flex: 2 }}>
                          EXPIRATION
                        </ProposalTitleText>
                      </ProposalBanner>
                      {proposals.map(x => {
                        return (
                          <View key={x.proposalID} style={{ marginTop: 12 }}>
                            <ClickableProposalRow
                              onClick={() =>
                                this.handleSelectProposal(x.proposalID)
                              }
                            >
                              <Text style={{ flex: 1, paddingLeft: 2 }}>
                                {x.proposalID}
                              </Text>
                              <Text style={{ flex: 2 }}>{x.stage}</Text>
                              <Text style={{ flex: 3 }}>Title...</Text>
                              <Text style={{ flex: 2, fontSize: 12 }}>
                                {convertCeloEpochToTimestamp(
                                  x.queuedAtTimestamp,
                                )}
                              </Text>
                            </ClickableProposalRow>
                            <Collapse
                              isOpen={x.proposalID === selectedProposalID}
                            >
                              <ProposalDetails>
                                <ProposalDetailsRow>
                                  <Block />
                                  <ProposerRow style={{ flex: 7 }}>
                                    <Text>
                                      <b>Proposer:</b> <Code>{x.proposer}</Code>{" "}
                                    </Text>
                                    <CopyIcon
                                      style={{ marginLeft: 6 }}
                                      onClick={() => {
                                        copyTextToClipboard(x.proposer);
                                      }}
                                    />
                                  </ProposerRow>
                                </ProposalDetailsRow>
                                <ProposalDetailsRow>
                                  <Block />
                                  <Text style={{ flex: 7 }}>
                                    <b>Details:</b>{" "}
                                    <Link
                                      href={x.gist}
                                      style={{ fontSize: 12 }}
                                    >
                                      {x.gist}
                                    </Link>
                                  </Text>
                                </ProposalDetailsRow>
                              </ProposalDetails>
                            </Collapse>
                          </View>
                        );
                      })}
                    </Card>
                  </Panel>
                  <Panel>
                    <H5 style={{ margin: 2, paddingLeft: 12 }}>
                      Proposal Details
                    </H5>
                    <Card
                      elevation={Elevation.TWO}
                      style={{ margin: 6, borderRadius: 0, height: 275 }}
                    ></Card>
                  </Panel>
                </ProposalsPanel>
                <Row style={{ marginTop: 12 }}>
                  <Panel>
                    <H5 style={{ margin: 2, paddingLeft: 12 }}>Events</H5>
                    <Card
                      elevation={Elevation.TWO}
                      style={{ margin: 6, borderRadius: 0, height: 275 }}
                    ></Card>
                  </Panel>
                </Row>
              </>
            );
          }}
        </GraphQLGuardComponent>
      </PageContainerScrollable>
    );
  }

  handleSelectProposal = (id: number) => {
    this.setState(ps => ({
      selectedProposalID: id === ps.selectedProposalID ? null : id,
    }));
  };
}

/** ===========================================================================
 * Styles
 * ============================================================================
 */

const Panel = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 250px;
`;

const ProposalsPanel = styled.div`
  display: flex;
  flex-wrap: wrap;
`;

const ProposalBanner = styled.div`
  display: flex;
  align-items: center;
  flex-direction: row;
  width: 100%;
  height: 25px;
  padding-left: 8px;
  padding-right: 8px;
  color: ${COLORS.HEAVY_DARK_TEXT};
  background: ${Colors.GRAY4};
`;

const ClickableProposalRow = styled.div`
  display: flex;
  align-items: center;
  flex-direction: row;
  width: 100%;
  padding: 4px;
  padding-left: 8px;
  padding-right: 8px;

  &:hover {
    cursor: pointer;
  }
`;

const Block = styled.div`
  flex: 1;
`;

const ProposalDetails = styled.div`
  padding-top: 8px;
  padding-bottom: 8px;
  background: ${(props: { theme: IThemeProps }) =>
    props.theme.isDarkTheme ? Colors.DARK_GRAY5 : Colors.LIGHT_GRAY3};
`;

const ProposalDetailsRow = styled.div`
  display: flex;
  align-items: center;
  flex-direction: row;
  width: 100%;
  padding-top: 6px;
  padding-bottom: 6px;
  padding-left: 8px;
  padding-right: 8px;
`;

const ProposerRow = styled.div`
  display: flex;
  align-items: center;
`;

const ProposalTitleText = styled.p`
  margin: 0;
  font-size: 12px;
  font-weight: bold;
`;

const Text = styled.p`
  margin: 0;
`;

/**
 * Group all of the proposal stages together and sort them by proposal ID.
 */
const groupAndSortProposals = (
  proposalHistory: ICeloGovernanceProposalHistory,
) => {
  return Object.values(proposalHistory)
    .filter(x => Array.isArray(x))
    .flat()
    .sort((a, b) => {
      return b.proposalID - a.proposalID;
    });
};

/** ===========================================================================
 * Props
 * ============================================================================
 */

const mapStateToProps = (state: ReduxStoreState) => ({
  i18n: i18nSelector(state),
  ledger: Modules.selectors.ledger.ledgerSelector(state),
});

const dispatchProps = {};

type ConnectProps = ReturnType<typeof mapStateToProps> & typeof dispatchProps;

const withProps = connect(mapStateToProps, dispatchProps);

interface ComponentProps {}

interface IProps
  extends ComponentProps,
    ConnectProps,
    CeloGovernanceProposalsProps {}

/** ===========================================================================
 * Export
 * ============================================================================
 */

export default composeWithProps<ComponentProps>(
  withProps,
  withGraphQLVariables,
  withCeloGovernanceProposals,
)(CeloGovernancePage);
