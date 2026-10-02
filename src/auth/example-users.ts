import type { Role } from "./roles";

/**
 * Fictional Harbourline staff. Passwords are for local example books only.
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
    email: "owner@harbourline.example",
    name: "Amina Rahman",
    role: "owner",
    entityScope: [],
    password: "Harbourline-owner-1",
  },
  {
    email: "admin@harbourline.example",
    name: "Ben Lim",
    role: "admin",
    entityScope: [],
    password: "Harbourline-admin-1",
  },
  {
    email: "accountant@harbourline.example",
    name: "Chloe Tan",
    role: "accountant",
    entityScope: [],
    password: "Harbourline-accountant-1",
  },
  {
    email: "approver@harbourline.example",
    name: "Farid Ismail",
    role: "approver",
    entityScope: [],
    password: "Harbourline-approver-1",
  },
  {
    email: "viewer@harbourline.example",
    name: "David Ong",
    role: "viewer",
    entityScope: [],
    password: "Harbourline-viewer-1",
  },
  {
    email: "viewer.sg@harbourline.example",
    name: "Elena Khoo",
    role: "viewer",
    entityScope: ["ent_harbourline_sg"],
    password: "Harbourline-viewer-sg-1",
  },
];
