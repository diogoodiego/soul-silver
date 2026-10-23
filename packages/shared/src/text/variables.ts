// Variables printed by message commands (0xFFFE). See specs/005-text-catalog/research.md R5.

export type VariableValue = "text" | "number";

export interface VariableKind {
  name: string;
  command: number;
  value: VariableValue;
}

export const TEXT_VARIABLES: readonly VariableKind[] = [
  { name: "pokemon-species", command: 0x0100, value: "text" },
  { name: "pokemon-name", command: 0x0101, value: "text" },
  { name: "trainer-name", command: 0x0103, value: "text" },
  { name: "ability", command: 0x0105, value: "text" },
  { name: "move", command: 0x0106, value: "text" },
  { name: "item", command: 0x0108, value: "text" },
  { name: "box", command: 0x010b, value: "text" },
  { name: "stat", command: 0x010d, value: "text" },
  { name: "type", command: 0x010f, value: "text" },
  { name: "status", command: 0x0111, value: "text" },
  { name: "pocket", command: 0x0112, value: "text" },
  { name: "phrase", command: 0x011c, value: "text" },
  { name: "number1", command: 0x0132, value: "number" },
  { name: "number2", command: 0x0133, value: "number" },
  { name: "number3", command: 0x0134, value: "number" },
  { name: "number4", command: 0x0135, value: "number" },
  { name: "number5", command: 0x0136, value: "number" },
  { name: "number6", command: 0x0137, value: "number" },
  { name: "number7", command: 0x0138, value: "number" },
  { name: "number8", command: 0x0139, value: "number" },
  { name: "number9", command: 0x013a, value: "number" },
  { name: "number10", command: 0x013b, value: "number" },
];

const BY_NAME = new Map(TEXT_VARIABLES.map((v) => [v.name, v]));
const BY_COMMAND = new Map(TEXT_VARIABLES.map((v) => [v.command, v]));

export function variableByName(name: string): VariableKind | undefined {
  return BY_NAME.get(name);
}

export function variableByCommand(command: number): VariableKind | undefined {
  return BY_COMMAND.get(command);
}
