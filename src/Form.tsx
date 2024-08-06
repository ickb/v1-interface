import { Input, Label, TextField, ToggleButton } from "react-aria-components";
import { direction2Symbol, symbol2Direction, toText } from "./utils.ts";
import { CKB, type I8Header } from "@ickb/lumos-utils";
import { ckb2Ickb, ickb2Ckb } from "@ickb/v1-core";
import { headerPlaceholder } from "./queries.ts";

export default function Form({
  rawText,
  setRawText,
  amount,
  tipHeader,
  isFrozen,
}: {
  rawText: string;
  setRawText: (s: string) => void;
  amount: bigint;
  tipHeader: I8Header;
  isFrozen: boolean;
}) {
  const symbol = rawText[0];
  const text = rawText.slice(1);
  const isCkb2Udt = symbol2Direction(symbol);
  const toggle = (isC2I: boolean) => setRawText(direction2Symbol(isC2I) + text);

  return (
    <>
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
            onChange={toggle}
            aria-label="Conversion direction"
          >
            {isCkb2Udt ? "CKB" : "ICKB"}
          </ToggleButton>
        </Label>
      </TextField>
      {tipHeader === headerPlaceholder ? undefined : (
        <ToggleButton
          isDisabled={isFrozen}
          className="text-s h-min-12 text-s h-min-12 flex w-full flex-auto items-center justify-center space-x-4 rounded px-8 text-center align-middle font-bold uppercase leading-relaxed tracking-wider"
          isSelected={isCkb2Udt}
          onChange={toggle}
          aria-label="Conversion direction"
        >
          <span className="w-full">{isCkb2Udt ? "1 CKB" : "1 ICKB"}</span>
          <span className="px-4">⇌</span>
          <span className="w-full">
            {approxConversion(isCkb2Udt, CKB, tipHeader)}
          </span>
        </ToggleButton>
      )}
      {amount > 0 ? (
        <div className="text-center font-bold uppercase leading-relaxed tracking-wider">
          {`~ ${approxConversion(isCkb2Udt, amount, tipHeader)}`}
        </div>
      ) : undefined}
    </>
  );
}

function approxConversion(
  isCkb2Udt: boolean,
  amount: bigint,
  tipHeader: I8Header,
) {
  let [convertedAmount, unit] = isCkb2Udt
    ? [ckb2Ickb(amount, tipHeader), "ICKB"]
    : [ickb2Ckb(amount, tipHeader), "CKB"];
  //Worst case scenario is a 0.1% fee for bot
  convertedAmount -= convertedAmount / 1000n;

  return `${toText(convertedAmount)} ${unit}`;
}
