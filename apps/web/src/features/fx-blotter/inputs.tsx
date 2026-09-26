import { useState, type InputHTMLAttributes } from 'react'

type CommitInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange'> & {
  value: string
  onCommit: (text: string) => void
}

/**
 * A text box that reports only on the native change event — leaving the box or pressing Enter
 * after editing — as the original's onchange handlers did. The page then re-rendered every cell
 * from the model, so a rejected value (a malformed date) snapped back; this box does the same
 * by showing the model's value again whenever it is committed or changes.
 */
export function CommitInput({ value, onCommit, onBlur, onKeyDown, ...rest }: CommitInputProps) {
  const [text, setText] = useState(value)
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    setText(value)
  }

  const commit = () => {
    if (text === value) return
    onCommit(text)
    setText(value)
  }

  return (
    <input
      {...rest}
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => {
        commit()
        onBlur?.(e)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        onKeyDown?.(e)
      }}
    />
  )
}
