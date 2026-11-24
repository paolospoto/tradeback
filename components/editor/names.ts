/** English display names passed from the server to the editor island. */
export interface NameTables {
  species: Record<number, string>;
  items: Record<number, string>;
  abilities: Record<number, string>;
}

export function speciesLabel(names: NameTables, id: number): string {
  return names.species[id] ?? `#${id}`;
}

export function itemLabel(names: NameTables, id: number): string {
  return names.items[id] ?? `#${id}`;
}

export function abilityLabel(names: NameTables, id: number): string {
  return names.abilities[id] ?? `#${id}`;
}
