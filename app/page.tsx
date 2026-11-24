import { EditorIsland } from "@/components/editor/EditorIsland";
import type { NameTables } from "@/components/editor/names";
import { displayTable } from "@/lib/data/display";
import { t } from "@/lib/i18n";

/** English names only: the island never calls PokéAPI. */
function nameTables(): NameTables {
  const d = displayTable();
  const pick = (r: Record<string, { en: string }>) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [Number(k), v.en]));
  return { species: pick(d.species), items: pick(d.items), abilities: pick(d.abilities) };
}

/** The whole app: load a save, pick, evolve, download. */
export default function HomePage() {
  return (
    <>
      <h1 className="visually-hidden">{t.site.tagline}</h1>
      <EditorIsland names={nameTables()} />
    </>
  );
}
