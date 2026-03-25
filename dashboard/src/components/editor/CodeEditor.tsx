import Editor from '@monaco-editor/react'

interface Props {
  value: string
  onChange: (v: string) => void
  readOnly?: boolean
}

export default function CodeEditor({ value, onChange, readOnly }: Props) {
  return (
    <Editor
      height="100%"
      language="cpp"
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      options={{
        readOnly,
        fontSize: 14,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        lineNumbers: 'on',
        renderLineHighlight: 'gutter',
        tabSize: 2,
        automaticLayout: true,
      }}
    />
  )
}
