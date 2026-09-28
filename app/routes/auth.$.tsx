
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

/* /auth/session-token and /auth/exit-iframe are answered by a
   thrown 200 Response with an App Bridge script. This renders it
   instead of React Router's default "200" error screen. */
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}
