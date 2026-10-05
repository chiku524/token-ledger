import { content } from "@/components/landing/content";
import { InstitutionCards } from "@/components/landing/institution-cards";
import { Reveal } from "@/components/motion/reveal";

export function Institutions() {
  return (
    <section className="page-width py-16 sm:py-20" aria-labelledby="institutions-title">
      <Reveal>
        <h2 id="institutions-title" className="section-title max-w-2xl">
          {content.institutionsTitle}
        </h2>
      </Reveal>
      <InstitutionCards />
    </section>
  );
}
