import type { LoaderFunctionArgs } from "react-router";
import {
  Link,
  Outlet,
  useLoaderData,
} from "react-router";

import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

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

        <Link to="/app/settings">
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