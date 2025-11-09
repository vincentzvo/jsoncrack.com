import React, { useEffect, useState } from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, Textarea, Button, Flex, CloseButton, Group } from "@mantine/core";
import type { NodeData, NodeRow } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";
import { modify, applyEdits } from "jsonc-parser";

// copy of normalize logic used for display/edit
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj: Record<string, any> = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

const jsonType = (val: any): NodeRow["type"] => {
  if (val === null) return "null" as any;
  if (Array.isArray(val)) return "array" as any;
  if (typeof val === "number") return "number" as any;
  if (typeof val === "boolean") return "boolean" as any;
  if (typeof val === "object") return "object" as any;
  return "string" as any;
};

type Props = ModalProps & { nodeData: NodeData | null };

export const EditableNodeModal = ({ opened, onClose, nodeData }: Props) => {
  const setSelectedNode = useGraph(state => state.setSelectedNode);

  // For parent nodes we should only allow editing primitive fields (no object/array children).
  const getEditableString = (nodeData?: NodeData | null) => {
    // If node is a single primitive value (no key) allow editing the primitive
    if (!nodeData) return "{}";
    if (nodeData.text.length === 1 && !nodeData.text[0].key) return `${nodeData.text[0].value}`;

    const obj: Record<string, any> = {};
    nodeData.text.forEach(row => {
      if (row.type !== "array" && row.type !== "object") {
        if (row.key) obj[row.key] = row.value;
      }
    });

    return JSON.stringify(obj, null, 2);
  };

  const [text, setText] = useState(() => getEditableString(nodeData));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setText(getEditableString(nodeData));
    setError(null);
  }, [nodeData, opened]);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(text);

      // Determine if this node is a primitive (single unnamed value)
      const isPrimitive = nodeData && nodeData.text.length === 1 && !nodeData.text[0].key;

      if (nodeData) {
        let currentJson = useJson.getState().getJson();
        const path = nodeData.path ?? [];

        try {
          if (isPrimitive) {
            // Replace the node value directly
            const edits = modify(currentJson, path as any, parsed as any, {
              formattingOptions: { insertSpaces: true, tabSize: 2 },
            });
            currentJson = applyEdits(currentJson, edits);
          } else {
            // Only modify primitive child keys. Build list of editable keys from nodeData.text
            const editableKeys = nodeData.text
              .filter(r => r.type !== "array" && r.type !== "object" && r.key)
              .map(r => r.key) as string[];

            const newObj = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};

            // Use union of keys so we can delete removed keys
            const keys = Array.from(new Set([...editableKeys, ...Object.keys(newObj)]));

            for (const key of keys) {
              const fullPath = [...path, key];
              const value = Object.prototype.hasOwnProperty.call(newObj, key) ? newObj[key] : undefined;
              const edits = modify(currentJson, fullPath as any, value as any, {
                formattingOptions: { insertSpaces: true, tabSize: 2 },
              });
              currentJson = applyEdits(currentJson, edits);
            }
          }

          // update global json which will rebuild the graph via useJson.setJson
          useJson.getState().setJson(currentJson);

          // re-select updated node in graph (find by path)
          const nodes = useGraph.getState().nodes;
          const found = nodes.find(n => JSON.stringify(n.path) === JSON.stringify(path));
          if (found) useGraph.getState().setSelectedNode(found);
        } catch (err) {
          // fallback: update only selected node in graph store (non-persistent)
          const rows: NodeRow[] = [];
          if (isPrimitive) {
            const type = jsonType(parsed);
            rows.push({ key: null, value: type === "object" || type === "array" ? null : parsed, type });
          } else {
            Object.keys(parsed || {}).forEach(key => {
              const value = parsed[key];
              const type = jsonType(value);
              rows.push({ key, value: type === "object" || type === "array" ? null : value, type });
            });
          }
          setSelectedNode({ ...nodeData, text: rows });
        }
      }

      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Flex justify="space-between" align="center">
          <Text fz="xs" fw={500}>
            Edit Node
          </Text>
          <CloseButton onClick={onClose} />
        </Flex>

        <Textarea
          minRows={6}
          value={text}
          onChange={e => setText(e.currentTarget.value)}
          autosize
          styles={{ input: { fontFamily: "monospace" } }}
        />

        {error && (
          <Text color="red" fz="xs">
            {error}
          </Text>
        )}

        <Group justify="right">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </Group>
      </Stack>
    </Modal>
  );
};

export default EditableNodeModal;
