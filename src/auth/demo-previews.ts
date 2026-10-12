import type { Role } from "./roles";

/** Public labels for the example-books role picker. No passwords. */
export const DEMO_PREVIEWS: readonly {
  id: string;
  label: string;
  role: Role;
  email: string;
  name: string;
  entityScope: readonly string[];
}[] = [
  { id: "owner", label: "Owner", role: "owner", email: "owner@assetmanager-a.example", name: "Amina Rahman", entityScope: [] },
  { id: "admin", label: "Admin", role: "admin", email: "admin@assetmanager-a.example", name: "Ben Lim", entityScope: [] },
  { id: "accountant", label: "Accountant", role: "accountant", email: "accountant@assetmanager-a.example", name: "Chloe Tan", entityScope: [] },
  { id: "approver", label: "Approver", role: "approver", email: "approver@assetmanager-a.example", name: "Farid Ismail", entityScope: [] },
  { id: "viewer", label: "Viewer", role: "viewer", email: "viewer@assetmanager-a.example", name: "David Ong", entityScope: [] },
  {
    id: "viewer-scoped",
    label: "Viewer · one company",
    role: "viewer",
    email: "viewer.scoped@assetmanager-a.example",
    name: "Elena Khoo",
    entityScope: ["ent_asset_manager_a"],
  },
  {
    id: "onboarding",
    label: "Onboarding",
    role: "onboarding",
    email: "onboarding@assetmanager-a.example",
    name: "Priya Nair",
    entityScope: [],
  },
];
