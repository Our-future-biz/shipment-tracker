"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";

// The links a company registers itself through, and what the form calls the terms.

const LINKS_KEY = ["registration-links"] as const;
const SETTINGS_KEY = ["registration-settings"] as const;

export const useRegistrationLinks = ({ enabled = true }: { enabled?: boolean } = {}) => {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: LINKS_KEY, queryFn: async () => (await api.customers.registrationLinkList()).links, enabled });
  const refresh = () => queryClient.invalidateQueries({ queryKey: LINKS_KEY });
  const create = useMutation({ mutationFn: (params: { roles: interfaces.CustomerRole[]; label?: string }) => api.customers.registrationLinkCreate(params), onSuccess: refresh });
  const revoke = useMutation({ mutationFn: (id: string) => api.customers.registrationLinkRevoke(id), onSettled: refresh });
  return { links: query.data ?? [], isLoading: query.isLoading, create, revoke };
};

export const useRegistrationSettings = () => {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => api.customers.registrationSettingsGet() });
  const save = useMutation({
    mutationFn: (params: { termsName: string; termsUrl: string }) => api.customers.registrationSettingsSave(params),
    onSuccess: (saved) => queryClient.setQueryData(SETTINGS_KEY, saved),
  });
  return { settings: query.data, isLoading: query.isLoading, isError: query.isError, save };
};

// ─── The chat on a company in Company approval ───

const chatKey = (threadId: string) => ["approval-chat", threadId] as const;
const UNREAD_KEY = ["approval-chats-unread"] as const;

export const useApprovalChatsUnread = () => {
  const query = useQuery({ queryKey: UNREAD_KEY, queryFn: async () => (await api.customers.approvalChatUnread()).chats, refetchInterval: 60_000 });
  return { chats: query.data ?? [] };
};

export const useApprovalChat = (threadId: string | null) => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: chatKey(threadId ?? ""),
    queryFn: async () => {
      const { chat } = await api.customers.approvalChatGet(threadId!);
      // Reading it is what clears it from the bell.
      void queryClient.invalidateQueries({ queryKey: UNREAD_KEY });
      return chat;
    },
    enabled: !!threadId,
    refetchInterval: 15_000,
  });
  const put = ({ chat }: { chat: interfaces.ApprovalChat }) => queryClient.setQueryData(chatKey(chat.threadId), chat);
  const post = useMutation({ mutationFn: (text: string) => api.customers.approvalChatPost(threadId!, { text }), onSuccess: put });
  const addPerson = useMutation({ mutationFn: (userId: string) => api.customers.approvalChatAddPerson(threadId!, { userId }), onSuccess: put });
  const removePerson = useMutation({ mutationFn: (userId: string) => api.customers.approvalChatRemovePerson(threadId!, userId), onSuccess: put });
  return { chat: query.data, isLoading: query.isLoading, isError: query.isError, post, addPerson, removePerson };
};
