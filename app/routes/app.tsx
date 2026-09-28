import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import {
  Link,
  Outlet,
  useLoaderData,
  useRouteError,
} from "react-router";

import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

export async function loader({
  request,
}: LoaderFunctionArgs) {
  await authenticate.admin(request);

  return {
    apiKey:
      process.env.SHOPIFY_API_KEY || "",
  };
}

export default function App() {
  const { apiKey } =
    useLoaderData<typeof loader>();

  return (
    <AppProvider
      embedded
      apiKey={apiKey}
    >
      <NavMenu>
        <Link
          to="/app"
          rel="home"
        >
          Home
        </Link>

        <Link to="/app/campaigns">
          Campaigns
        </Link>

        <Link to="/app/popups">
          Popups
        </Link>

        <Link to="/app/contacts">
          Contacts
        </Link>

        <Link to="/app/analytics">
          Analytics
        </Link>

        <Link to="/app/email-templates">
          Email templates
        </Link>

        <Link to="/app/emails">
          Logs
        </Link>

        <Link to="/app/settings/channels">
          Settings
        </Link>

        <Link to="/app/brain">
          ✦ MQ Brain
        </Link>
      </NavMenu>

      <Outlet />
    </AppProvider>
  );
}

/* Shopify's authenticate.admin() sometimes answers by throwing a
   Response instead of returning, for example the page that fetches
   a fresh session token, or the one that leaves the iframe to
   re-authorize. Those Responses have status 200 and carry a small
   App Bridge script. Without this boundary React Router shows its
   default error screen, which is just "200". boundary.error()
   renders that script so App Bridge can finish the job and reload
   the page, and boundary.headers() keeps Shopify's headers on it. */
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
