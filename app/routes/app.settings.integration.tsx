import { redirect, type LoaderFunctionArgs } from "react-router";

/** Ruta antigua unificada en `/app` (Inicio). */
export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  throw redirect(qs ? `/app?${qs}` : "/app");
};

export default function LegacyIntegrationRedirect() {
  return null;
}
