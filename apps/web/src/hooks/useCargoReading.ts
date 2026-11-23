"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fileToBase64 } from "@/lib/files";

/** What is read: a file, or a pasted text. */
export type CargoSource = { file: File } | { text: string };

/** Has the AI read the cargo lines of a file or a pasted text (one paid reading each time). */
export const useCargoReading = () => {
  const read = useMutation({
    mutationFn: async (source: CargoSource) =>
      "file" in source
        ? api.extraction.extractCargoList({ fileBase64: await fileToBase64(source.file), fileName: source.file.name })
        : api.extraction.extractCargoList({ text: source.text }),
  });
  return { readCargo: read.mutateAsync, isReading: read.isPending };
};
