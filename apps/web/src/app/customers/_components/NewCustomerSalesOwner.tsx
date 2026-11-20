"use client";

import { Form, Select } from "antd";
import { useAuth, useCanManageCustomers } from "@/lib/auth/AuthContext";
import { useUsers } from "@/hooks/useUsers";
import { useDepartments } from "@/hooks/useOrgUnits";
import { matchesUserOption, userIdOptions, UserOptionLabel } from "@/app/sales/_lib/userOptions";
import { defaultSalesOwner, salesOwnerChoices } from "../_lib/salesOwnerDefault";

interface NewCustomerSalesOwnerProps {
  /** The owner picked here: a user's id, null for nobody; undefined while untouched. */
  picked: string | null | undefined;
  onPick: (userId: string | null) => void;
  disabled?: boolean;
}

// Add customer's Sales owner (mock council R12): who the new customer belongs to, seen and changeable
// before it is created. It starts with the user adding it when they are in Sales or a manager, else
// nobody - an operator adding a consignee for a job no longer becomes its sales owner unseen. Left
// untouched, nothing is sent and the server gives the customer the owner by the same rule. A user who is
// no manager is offered only themself or nobody, as the server allows (system-21 mock council review).
export function NewCustomerSalesOwner({ picked, onPick, disabled }: NewCustomerSalesOwnerProps) {
  const { user } = useAuth();
  const isManager = useCanManageCustomers();
  const { users, isLoading } = useUsers();
  const { departments, isLoading: departmentsLoading } = useDepartments();
  const loading = isLoading || departmentsLoading;
  const shown = picked !== undefined ? picked : loading ? undefined : defaultSalesOwner(user, users, departments);

  return (
    <Form.Item
      label="Sales owner"
      htmlFor="add-customer-sales-owner"
      extra={
        isManager
          ? "Whoever owns the customer has it in My customers. Afterwards only a manager can change it."
          : "Whoever owns the customer has it in My customers. You can pick yourself or nobody; only a manager can pick someone else or change it later."
      }
      className="!mb-3"
    >
      <Select
        id="add-customer-sales-owner"
        showSearch
        allowClear
        loading={loading}
        disabled={disabled}
        placeholder="Nobody"
        filterOption={matchesUserOption}
        value={shown ?? undefined}
        options={userIdOptions(salesOwnerChoices(user?.id, isManager, users))}
        optionRender={(option) => <UserOptionLabel label={option.label} name={option.data.name} />}
        onChange={(userId?: string) => onPick(userId ?? null)}
      />
    </Form.Item>
  );
}
