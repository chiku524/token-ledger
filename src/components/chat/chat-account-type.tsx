"use client";

import { createContext, useContext } from "react";
import type { OrganizationAccountType } from "@/data/account-type";

/**
 * The account type of the signed-in user, for chat parts that render outside the
 * panel's own props (the tool-call cards are mounted by assistant-ui). Undefined
 * means an organization, as everywhere else.
 */
const ChatAccountTypeContext = createContext<OrganizationAccountType | undefined>(undefined);

export const ChatAccountTypeProvider = ChatAccountTypeContext.Provider;

export function useChatAccountType(): OrganizationAccountType | undefined {
  return useContext(ChatAccountTypeContext);
}
