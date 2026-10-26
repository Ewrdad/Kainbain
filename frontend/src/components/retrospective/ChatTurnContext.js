import { createContext } from 'react';

/***
 * MARK: ChatTurnContext
 * @description Carries the app-level chat turn state (`{ chat }`, owned by
 *   `ChatTurnProvider`) to the retrospective chat UI. Null outside a
 *   provider — the `useRetrospectiveChat` adapter then falls back to a local
 *   controller instance, so route-level tests and embeds keep working
 *   without the provider mounted.
 * @example const fromProvider = useContext(ChatTurnContext);
 ***/
export const ChatTurnContext = createContext(null);
