import type { Role } from "./roles";

/**
 * Fictional Asset Manager A staff. Passwords are for local example books only.
 * They are not production credentials. Do not import this module from a client component.
 */
export const EXAMPLE_USERS: readonly {
  email: string;
  name: string;
  role: Role;
  entityScope: readonly string[];
  password: string;
}[] = [
  {
    email: "owner@assetmanager-a.example",
    name: "Amina Rahman",
    role: "owner",
    entityScope: [],
    password: "AssetManagerA-owner-1",
  },
  {
    email: "admin@assetmanager-a.example",
    name: "Ben Lim",
    role: "admin",
    entityScope: [],
    password: "AssetManagerA-admin-1",
  },
  {
    email: "accountant@assetmanager-a.example",
    name: "Chloe Tan",
    role: "accountant",
    entityScope: [],
    password: "AssetManagerA-accountant-1",
  },
  {
    email: "approver@assetmanager-a.example",
    name: "Farid Ismail",
    role: "approver",
    entityScope: [],
    password: "AssetManagerA-approver-1",
  },
  {
    email: "viewer@assetmanager-a.example",
    name: "David Ong",
    role: "viewer",
    entityScope: [],
    password: "AssetManagerA-viewer-1",
  },
  {
    email: "viewer.scoped@assetmanager-a.example",
    name: "Elena Khoo",
    role: "viewer",
    entityScope: ["ent_asset_manager_a"],
    password: "AssetManagerA-viewer-scoped-1",
  },
  {
    email: "onboarding@assetmanager-a.example",
    name: "Priya Nair",
    role: "onboarding",
    entityScope: [],
    password: "AssetManagerA-onboarding-1",
  },
];
