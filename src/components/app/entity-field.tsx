import { Field } from "@/components/app/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Books } from "@/data/books";

/**
 * Which company a new connection belongs to. An organization picks one. An
 * individual has a single set of accounts, so the choice is made for them and
 * the word "Company" never appears. With more than one entity the choice is
 * shown for either kind, so nothing is silently assigned.
 */
export function EntityField({ entities, individual = false }: { entities: Books["entities"]; individual?: boolean }) {
  const only = entities[0];
  if (individual && entities.length === 1 && only) return <input type="hidden" name="entityId" value={only.id} />;
  return (
    <Field label="Company">
      <NativeSelect name="entityId" required defaultValue={only?.id}>
        {entities.map((entity) => (
          <NativeSelectOption key={entity.id} value={entity.id}>
            {entity.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}
