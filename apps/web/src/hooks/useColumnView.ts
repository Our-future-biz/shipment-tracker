"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useColumnPrefs } from "./useColumnPrefs";
import { useColumnTemplates } from "./useColumnTemplates";

// Coordinates the live column view: a template (when one is "active") or the
// per-user default. Edits (reorder / show-hide) route to whichever is active.
export function useColumnView(userId: string | undefined, token: string | null) {
  const prefs = useColumnPrefs(userId);
  const { templates, templatesLoaded, saveTemplate, createTemplate, deleteTemplate } = useColumnTemplates(userId, token);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);

  const activeKey = userId ? `shipmentActiveTemplate:${userId}` : null;

  useEffect(() => {
    if (!activeKey) {
      setActiveTemplateId(null);
      return;
    }
    try {
      setActiveTemplateId(localStorage.getItem(activeKey));
    } catch {
      setActiveTemplateId(null);
    }
  }, [activeKey]);

  const persistActive = useCallback(
    (id: string | null) => {
      setActiveTemplateId(id);
      if (!activeKey) return;
      try {
        if (id) localStorage.setItem(activeKey, id);
        else localStorage.removeItem(activeKey);
      } catch {
        /* ignore */
      }
    },
    [activeKey],
  );

  const activeTemplate = useMemo(
    () => (activeTemplateId ? templates.find((t) => t.id === activeTemplateId) ?? null : null),
    [templates, activeTemplateId],
  );

  // Drop a stale active id if its template no longer exists (deleted elsewhere).
  useEffect(() => {
    if (activeTemplateId && templatesLoaded && !templates.some((t) => t.id === activeTemplateId)) {
      persistActive(null);
    }
  }, [activeTemplateId, templatesLoaded, templates, persistActive]);

  const visible = activeTemplate ? activeTemplate.columns : prefs.visible;

  const setVisible = useCallback(
    (keys: string[]) => {
      if (activeTemplate) saveTemplate(activeTemplate.name, keys);
      else prefs.save(keys);
    },
    [activeTemplate, saveTemplate, prefs],
  );

  const saveAsTemplate = useCallback(
    async (name: string) => {
      const created = await createTemplate(name, visible);
      if (created) persistActive(created.id);
    },
    [createTemplate, visible, persistActive],
  );

  const removeTemplate = useCallback(
    (id: string) => {
      deleteTemplate(id);
      if (id === activeTemplateId) persistActive(null);
    },
    [deleteTemplate, activeTemplateId, persistActive],
  );

  const reset = useCallback(() => {
    persistActive(null);
    prefs.reset();
  }, [persistActive, prefs]);

  return {
    visible,
    setVisible,
    reset,
    templates,
    activeTemplateId,
    applyTemplate: (id: string) => persistActive(id),
    deactivate: () => persistActive(null),
    saveAsTemplate,
    deleteTemplate: removeTemplate,
  };
}
