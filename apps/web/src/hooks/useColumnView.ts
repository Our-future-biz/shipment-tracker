"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { withFixedColumns } from "@/lib/columnConfig";
import { useColumnPrefs } from "./useColumnPrefs";
import { useColumnTemplates } from "./useColumnTemplates";

// Coordinates the live column view: a template (when one is "active") or the
// per-user default. Edits (reorder / show-hide) route to whichever is active.
export function useColumnView(userId: string | undefined, token: string | null) {
  const prefs = useColumnPrefs(userId);
  const { templates, templatesLoaded, saveTemplate, createTemplate, deleteTemplate } = useColumnTemplates(userId, token);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  // Unsaved column edits made while a template is active. null = show the
  // template as-is. Buffering here means "Save as new" won't also mutate the
  // currently active template.
  const [workingColumns, setWorkingColumns] = useState<string[] | null>(null);

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
      setWorkingColumns(null);
      persistActive(null);
    }
  }, [activeTemplateId, templatesLoaded, templates, persistActive]);

  const visible = useMemo(
    () => withFixedColumns(workingColumns ?? (activeTemplate ? activeTemplate.columns : prefs.visible)),
    [workingColumns, activeTemplate, prefs.visible],
  );

  const setVisible = useCallback(
    (keys: string[]) => {
      const normalized = withFixedColumns(keys);
      // With a template active, edits stay in the working buffer until the user
      // explicitly saves them (to this template or as a new one). The default
      // view has no branching concern, so it auto-saves to prefs.
      if (activeTemplate) setWorkingColumns(normalized);
      else prefs.save(normalized);
    },
    [activeTemplate, prefs],
  );

  // Whether the working buffer differs from the active template's saved columns.
  const isDirty = useMemo(() => {
    if (!activeTemplate || workingColumns == null) return false;
    const a = withFixedColumns(workingColumns);
    const b = withFixedColumns(activeTemplate.columns);
    return a.length !== b.length || a.some((k, i) => k !== b[i]);
  }, [activeTemplate, workingColumns]);

  // Persist the working buffer to the currently active template.
  const saveActiveTemplate = useCallback(() => {
    if (activeTemplate && workingColumns) {
      saveTemplate(activeTemplate.name, withFixedColumns(workingColumns));
      setWorkingColumns(null);
    }
  }, [activeTemplate, workingColumns, saveTemplate]);

  const saveAsTemplate = useCallback(
    async (name: string) => {
      const created = await createTemplate(name, visible);
      if (created) {
        setWorkingColumns(null);
        persistActive(created.id);
      }
    },
    [createTemplate, visible, persistActive],
  );

  const applyTemplate = useCallback(
    (id: string) => {
      setWorkingColumns(null);
      persistActive(id);
    },
    [persistActive],
  );

  const deactivate = useCallback(() => {
    setWorkingColumns(null);
    persistActive(null);
  }, [persistActive]);

  const removeTemplate = useCallback(
    (id: string) => {
      deleteTemplate(id);
      if (id === activeTemplateId) {
        setWorkingColumns(null);
        persistActive(null);
      }
    },
    [deleteTemplate, activeTemplateId, persistActive],
  );

  const reset = useCallback(() => {
    setWorkingColumns(null);
    persistActive(null);
    prefs.reset();
  }, [persistActive, prefs]);

  return {
    visible,
    setVisible,
    reset,
    templates,
    activeTemplateId,
    isDirty,
    applyTemplate,
    deactivate,
    saveActiveTemplate,
    saveAsTemplate,
    deleteTemplate: removeTemplate,
  };
}
