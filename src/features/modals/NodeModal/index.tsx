import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button, Group, Textarea } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useJson from "../../../store/useJson";
import { modify, applyEdits } from "jsonc-parser";
import useFile from "../../../store/useFile";

const jsonType = (val: any) => {
  if (val === null) return "null";
  if (Array.isArray(val)) return "array";
  if (typeof val === "number") return "number";
  if (typeof val === "boolean") return "boolean";
  if (typeof val === "object") return "object";
  return "string";
};

 

const EditableNodeModalInline = ({ opened, onClose, nodeData }: { opened: boolean; onClose: () => void; nodeData: NodeData | null }) => {
  const setSelectedNode = useGraph(state => state.setSelectedNode);
  // For parent nodes we should only allow editing primitive fields (no object/array children).
  const getEditableString = (nodeData?: NodeData | null) => {
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

  const [text, setText] = React.useState(() => getEditableString(nodeData));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setText(getEditableString(nodeData));
    setError(null);
  }, [nodeData, opened]);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(text);
      const rows: any[] = [];

      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        Object.keys(parsed).forEach(key => {
          const value = parsed[key];
          const type = jsonType(value);
          rows.push({ key, value: type === "object" || type === "array" ? null : value, type });
        });
      } else {
        const type = jsonType(parsed);
        rows.push({ key: null, value: type === "object" || type === "array" ? null : parsed, type });
      }

      if (nodeData) {
        let currentJson = useJson.getState().getJson();
        const path = nodeData.path ?? [];
        try {
          // If primitive node, replace value directly. Otherwise only edit primitive child keys.
          const isPrimitive = nodeData.text.length === 1 && !nodeData.text[0].key;
          if (isPrimitive) {
            const edits = modify(currentJson, path as any, parsed as any, {
              formattingOptions: { insertSpaces: true, tabSize: 2 },
            });
            currentJson = applyEdits(currentJson, edits);
          } else {
            const editableKeys = nodeData.text
              .filter(r => r.type !== "array" && r.type !== "object" && r.key)
              .map(r => r.key) as string[];

            const newObj = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
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

          useJson.getState().setJson(currentJson);
          useFile.getState().setContents({ contents: currentJson, hasChanges: false, skipUpdate: true });

          const nodes = useGraph.getState().nodes;
          const found = nodes.find(n => JSON.stringify(n.path) === JSON.stringify(path));
          if (found) useGraph.getState().setSelectedNode(found);
        } catch (err) {
          setSelectedNode({ ...nodeData, text: rows });
        }
      }

      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Modal size="sm" opened={opened} onClose={onClose} centered withCloseButton={false}>
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

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const [editorOpen, setEditorOpen] = React.useState(false);

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Group gap="xs">
              <Button variant="default" size="xs" onClick={() => setEditorOpen(true)}>
                Edit
              </Button>
              <CloseButton onClick={onClose} />
            </Group>
          </Flex>
          <ScrollArea.Autosize mah={250} maw={600}>
            <CodeHighlight
              code={normalizeNodeData(nodeData?.text ?? [])}
              miw={350}
              maw={600}
              language="json"
              withCopyButton
            />
          </ScrollArea.Autosize>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
  <EditableNodeModalInline opened={editorOpen} onClose={() => setEditorOpen(false)} nodeData={nodeData} />
    </Modal>
  );
};
