import { PageTransition } from "@/components/motion/fade-in";

export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
