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
  { id: "owner", label: "Owner", role: "owner", email: "owner@harbourline.example", name: "Amina Rahman", entityScope: [] },
  { id: "admin", label: "Admin", role: "admin", email: "admin@harbourline.example", name: "Ben Lim", entityScope: [] },
  { id: "accountant", label: "Accountant", role: "accountant", email: "accountant@harbourline.example", name: "Chloe Tan", entityScope: [] },
  { id: "approver", label: "Approver", role: "approver", email: "approver@harbourline.example", name: "Farid Ismail", entityScope: [] },
  { id: "viewer", label: "Viewer", role: "viewer", email: "viewer@harbourline.example", name: "David Ong", entityScope: [] },
  {
    id: "viewer-sg",
    label: "Viewer · Singapore only",
    role: "viewer",
    email: "viewer.sg@harbourline.example",
    name: "Elena Khoo",
    entityScope: ["ent_harbourline_sg"],
  },
  {
    id: "onboarding",
    label: "Onboarding",
    role: "onboarding",
    email: "onboarding@harbourline.example",
    name: "Priya Nair",
    entityScope: [],
  },
];
