import { listVenues } from "@/adapters";
import { isOauthExchange, oauthDefaultTab, readOauthClient } from "@/auth/exchange-oauth";
import type { ConnectExchange } from "@/components/connect-modal";

/** Exchanges for the connect modal. OAuth venues are listed first. */
export function connectExchanges(): ConnectExchange[] {
  return listVenues()
    .map((venue) => {
      const oauthVenue = isOauthExchange(venue.key) ? venue.key : null;
      const oauthReady = oauthVenue !== null && readOauthClient(oauthVenue) !== null;
      return {
        key: venue.key,
        label: venue.label,
        scopes: venue.scopes,
        oauth: oauthVenue !== null,
        oauthReady,
        // When OAuth client env is missing, open on the API key form instead of a disabled OAuth tab.
        defaultTab: oauthVenue && oauthReady ? oauthDefaultTab(oauthVenue) : ("api" as const),
      };
    })
    .sort((a, b) => Number(b.oauth) - Number(a.oauth) || a.label.localeCompare(b.label));
}
