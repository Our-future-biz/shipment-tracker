"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Drawer, Input, Select, Spin } from "antd";
import { CloseOutlined, SendOutlined } from "@ant-design/icons";
import { apiErrorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/date";
import { useApprovalChat } from "@/hooks/useCompanyRegistration";
import { useUsers } from "@/hooks/useUsers";
import { useToast } from "@/lib/toast";
import { Pill } from "@/components/Pill";
import { HINT, LABEL_TEXT } from "@/styles/ui";

interface ApprovalChatDrawerProps {
  /** Null keeps it closed. */
  threadId: string | null;
  onClose: () => void;
}

// The internal chat on a company in Company approval: every manager, the one who asked, and whoever a
// manager adds - a sales representative to get in touch with the company, for example.
export function ApprovalChatDrawer({ threadId, onClose }: ApprovalChatDrawerProps) {
  const { chat, isLoading, isError, post, addPerson, removePerson } = useApprovalChat(threadId);
  const { users } = useUsers();
  const toast = useToast();
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);

  const count = chat?.messages.length ?? 0;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count, threadId]);

  const send = () => {
    const written = text.trim();
    if (!written || post.isPending) return;
    post.mutate(written, { onSuccess: () => setText(""), onError: (e) => toast.error(apiErrorMessage(e)) });
  };

  const inChat = new Set((chat?.people ?? []).map((p) => p.userId));
  const addable = users.filter((u) => !inChat.has(u.id)).map((u) => ({ value: u.id, label: u.displayName || u.email }));

  return (
    <Drawer open={!!threadId} onClose={onClose} width={480} title={chat ? `Chat · ${chat.companyName}` : "Chat"} destroyOnHidden>
      {isError ? (
        <Alert type="error" showIcon message="This chat could not be opened." />
      ) : isLoading || !chat ? (
        <div className="flex justify-center py-16">
          <Spin />
        </div>
      ) : (
        <div className="flex flex-col h-full gap-3">
          <div>
            <div className={`${LABEL_TEXT} mb-1`}>In this chat</div>
            <div className={`${HINT} mb-1.5`}>All sales managers, and:</div>
            <div className="flex flex-wrap gap-1.5">
              {chat.people.length === 0 && <span className={HINT}>Nobody else yet.</span>}
              {chat.people.map((p) => (
                <Pill key={p.userId} tone={p.isRequester ? "indigo" : "slate"}>
                  {p.name || "A colleague"}
                  {p.isRequester ? " · asked" : ""}
                  {chat.canAddPeople && !p.isRequester && (
                    <button
                      type="button"
                      aria-label={`Remove ${p.name || "this colleague"} from this chat`}
                      title="Remove from this chat"
                      disabled={removePerson.isPending}
                      className="ml-1.5 inline-flex items-center text-slate-400 hover:text-red-600 bg-transparent border-0 p-0 cursor-pointer"
                      onClick={() => removePerson.mutate(p.userId, { onError: (e) => toast.error(apiErrorMessage(e)) })}
                    >
                      <CloseOutlined className="text-[10px]" />
                    </button>
                  )}
                </Pill>
              ))}
            </div>
            {chat.canAddPeople && (
              <Select
                showSearch
                optionFilterProp="label"
                className="w-full !mt-2"
                placeholder="Add a colleague to this chat"
                value={null}
                options={addable}
                loading={addPerson.isPending}
                onChange={(userId: string) => addPerson.mutate(userId, { onError: (e) => toast.error(apiErrorMessage(e)) })}
              />
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 border-t border-slate-200 pt-3">
            {chat.messages.length === 0 && <span className={HINT}>No messages yet.</span>}
            {chat.messages.map((m) =>
              m.isSystem ? (
                <div key={m.id} className="text-center text-[12px] text-slate-500">
                  {m.text}
                  <span className="block text-[11px] text-slate-400 tabular-nums">{formatDateTime(m.at)}</span>
                </div>
              ) : (
                <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] ${m.mine ? "self-end bg-indigo-50" : "self-start bg-slate-100"}`}>
                  <div className="text-[11px] font-semibold text-slate-600">{m.author || "A colleague"}</div>
                  <div className="whitespace-pre-wrap text-slate-900">{m.text}</div>
                  <div className="text-[11px] text-slate-400 tabular-nums">{formatDateTime(m.at)}</div>
                </div>
              ),
            )}
            <div ref={end} />
          </div>
          <div className="flex gap-2 items-end border-t border-slate-200 pt-3">
            <Input.TextArea
              aria-label="Message"
              autoSize={{ minRows: 1, maxRows: 5 }}
              maxLength={2000}
              placeholder="Write a message"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPressEnter={(e) => {
                if (e.shiftKey) return;
                e.preventDefault();
                send();
              }}
            />
            <Button type="primary" icon={<SendOutlined />} aria-label="Send" loading={post.isPending} disabled={!text.trim()} onClick={send} />
          </div>
        </div>
      )}
    </Drawer>
  );
}
