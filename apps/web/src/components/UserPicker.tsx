"use client";

import { Select } from "antd";
import type { SelectProps } from "antd";
import { useUsers } from "@/hooks/useUsers";
import { isUnlinkedPerson, sortedUsers, userByEmail, userMatches } from "@/lib/people";

// The one way to pick a person: one of the company's users, found by typing their name or e-mail,
// stored and shown by e-mail. Nothing outside the list can be entered. A stored value that is no
// user's e-mail (an old name, free text) is shown as it is, marked, until a user is picked.
export interface UserPickerProps
  extends Pick<
    SelectProps,
    "size" | "variant" | "className" | "disabled" | "autoFocus" | "defaultOpen" | "onBlur" | "placeholder" | "style" | "popupMatchSelectWidth"
  > {
  /** The stored e-mail ("" for nobody). */
  value?: string | null;
  /** The picked user's e-mail, "" when cleared. */
  onChange?: (email: string) => void;
  /** Names the field for screen readers. */
  "aria-label"?: string;
  /** Set by Form.Item. */
  id?: string;
}

export function UserPicker({ value, onChange, placeholder = "Pick a user", "aria-label": ariaLabel, ...rest }: UserPickerProps) {
  const { users, isLoading } = useUsers();
  const current = (value ?? "").trim();
  const picked = userByEmail(current, users);
  const unlinked = !isLoading && isUnlinkedPerson(current, users);

  const options = sortedUsers(users).map((u) => ({
    value: u.email,
    label: u.email,
    name: u.displayName,
  }));
  // A stored value no user has: kept as the shown value (so nothing is lost) but not offered.
  const shownValue = picked ? picked.email : current || undefined;

  return (
    <Select
      {...rest}
      aria-label={ariaLabel}
      showSearch
      allowClear
      loading={isLoading}
      placeholder={placeholder}
      value={shownValue}
      status={unlinked ? "warning" : undefined}
      title={unlinked ? `"${current}" is not a user — pick one from the list` : undefined}
      options={options}
      filterOption={(input, option) => {
        const u = users.find((x) => x.email === option?.value);
        return !!u && userMatches(u, input);
      }}
      optionRender={(option) => (
        <span className="flex flex-col leading-tight py-0.5">
          <span className="text-slate-800">{option.data.name || option.data.value}</span>
          {option.data.name && <span className="text-[11px] text-slate-500">{option.data.value}</span>}
        </span>
      )}
      notFoundContent={isLoading ? "Loading users…" : "No user matches"}
      onChange={(email?: string) => onChange?.(email ?? "")}
    />
  );
}
