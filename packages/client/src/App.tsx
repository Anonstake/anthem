import { FocusStyleManager } from "@blueprintjs/core";
import * as Sentry from "@sentry/browser";
import client from "graphql/apollo-client";
import store, { history } from "modules/create-store";
import React from "react";
import { ApolloProvider } from "react-apollo";
import { ApolloProvider as ApolloHooksProvider } from "react-apollo-hooks";
import { Provider as ReduxProvider } from "react-redux";
import { Router as ReactRouter } from "react-router-dom";
import ENV from "tools/client-env";
import AppContainer from "ui/containers/AppContainer";
import { ThemeProvider } from "ui/containers/ThemeContainer";

// Disable focus styles for mouse events
FocusStyleManager.onlyShowFocusOnTabs();

// Initialize Sentry
Sentry.init({ dsn: ENV.SENTRY_DSN });

/** ===========================================================================
 * This is the top level App file which renders the app.
 * ============================================================================
 */

const App: React.FC = () => {
  return (
    <ReduxProvider store={store}>
      <ApolloProvider client={client}>
        <ApolloHooksProvider client={client}>
          <ReactRouter history={history}>
            <ThemeProvider>
              <AppContainer />
            </ThemeProvider>
          </ReactRouter>
        </ApolloHooksProvider>
      </ApolloProvider>
    </ReduxProvider>
  );
};

/** ===========================================================================
 * Export
 * ============================================================================
 */

export default App;
