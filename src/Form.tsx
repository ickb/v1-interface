import { Input, Label, TextField, ToggleButton } from "react-aria-components";
import { direction2Symbol, symbol2Direction } from "./utils.ts";

export default function Form({
  rawText,
  setRawText,
  isFrozen,
}: {
  rawText: string;
  setRawText: (s: string) => void;
  isFrozen: boolean;
}) {
  const symbol = rawText[0];
  const text = rawText.slice(1);
  const isCkb2Udt = symbol2Direction(symbol);

  return (
    <TextField
      isDisabled={isFrozen}
      autoFocus={true}
      value={text}
      onChange={(newText) => setRawText(symbol + newText)}
      autoComplete="off"
      inputMode="decimal"
      type="text"
      className="text-s relative h-12 w-full rounded font-bold uppercase leading-relaxed tracking-wider text-amber-400 disabled:opacity-50"
      aria-label="Amount to be converted"
    >
      <Input
        placeholder="0"
        className="absolute inset-0 rounded border-2 border-amber-400 bg-transparent px-8 text-left text-amber-400"
      />
      <Label className="absolute inset-0 inline-flex items-center justify-end px-8">
        <ToggleButton
          isDisabled={isFrozen}
          className="rounded-full bg-amber-400 px-2 text-zinc-900 disabled:opacity-50"
          isSelected={isCkb2Udt}
          onChange={(isC2I) => setRawText(direction2Symbol(isC2I) + text)}
          aria-label="Conversion direction"
        >
          {isCkb2Udt ? "CKB ⇌ ICKB" : "ICKB ⇌ CKB"}
        </ToggleButton>
      </Label>
    </TextField>
  );
}
