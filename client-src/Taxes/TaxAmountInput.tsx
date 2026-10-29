import React, { useEffect, useRef, useState } from 'react';
import AmountInput from '../AmountInput';
import { formatMoneyCents, type MoneyCents } from '../../common/moneyCents';
import { inputMoneyCents } from '../monetary';

// Retain editable text without turning cent state back into floating-point dollars.
const TaxAmountInput: React.FC<{ value: MoneyCents; onChange: (value: MoneyCents) => void }> = ({
  value, onChange }) => {
  const [draft, setDraft] = useState<{ value: MoneyCents; text: string }>({ value,
    text: formatMoneyCents(value) });
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    container.current?.querySelector('input')?.setCustomValidity('');
  }, [value]);
  if (value !== draft.value) {
    setDraft({ value, text: formatMoneyCents(value) });
  }

  const handleChange = (text: string) => {
    let cents: MoneyCents;
    try {
      if (text.trim() === '') throw new Error('Missing amount');
      cents = inputMoneyCents(text);
    }
    catch {
      setDraft({ value, text });
      container.current?.querySelector('input')?.setCustomValidity(
        'Enter a valid, safe monetary amount.');
      return;
    }
    container.current?.querySelector('input')?.setCustomValidity('');
    setDraft({ value: cents, text });
    onChange(cents);
  };

  return <div ref={container} style={{ display: 'contents' }}>
    <AmountInput exactCents value={draft.text} onValueChange={handleChange} onChange={() =>
      undefined} />
  </div>;
};

export default TaxAmountInput;
