import * as Primitive from "@radix-ui/react-select";
import { useState } from "react";
import { Icon } from "./ui";

export default function Select({ id, label, value, onValueChange, options, disabled, placeholder = "Chọn ngôn ngữ" }: {
  id?: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  placeholder?: string;
}) {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  return <Primitive.Root value={options.some((option) => option.value === value) ? value : ""}
    onValueChange={onValueChange} disabled={disabled || !options.length}>
    <Primitive.Trigger ref={setTrigger} id={id} aria-label={label} className="select-trigger">
      <Primitive.Value placeholder={options.length ? placeholder : "Đang tải…"} />
      <Primitive.Icon><Icon name="chevron" size={14} /></Primitive.Icon>
    </Primitive.Trigger>
    {/* Menu trong dialog phải ở cùng lớp nổi, tránh bị dialog che phía trên. */}
    <Primitive.Portal container={trigger?.closest("dialog") ?? undefined}>
      <Primitive.Content className="select-content" position="popper" sideOffset={6} collisionPadding={12}>
        <Primitive.ScrollUpButton className="select-scroll select-scroll-up"><Icon name="chevron" size={12} /></Primitive.ScrollUpButton>
        <Primitive.Viewport>{options.map((option) => <Primitive.Item key={option.value} value={option.value} className="select-item">
          <Primitive.ItemIndicator className="select-indicator"><Icon name="check" size={13} /></Primitive.ItemIndicator>
          <Primitive.ItemText>{option.label}</Primitive.ItemText>
        </Primitive.Item>)}</Primitive.Viewport>
        <Primitive.ScrollDownButton className="select-scroll"><Icon name="chevron" size={12} /></Primitive.ScrollDownButton>
      </Primitive.Content>
    </Primitive.Portal>
  </Primitive.Root>;
}
