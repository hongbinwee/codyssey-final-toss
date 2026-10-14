import { deleteLineItem } from "@lib/data/cart"
import { Spinner, Trash } from "@medusajs/icons"
import { clx } from "@modules/common/components/ui"
import { useRef, useState } from "react"

const DeleteButton = ({
  id,
  children,
  className,
  disabled = false,
  "data-testid": dataTestId,
  onDeletingChange,
}: {
  id: string
  children?: React.ReactNode
  className?: string
  disabled?: boolean
  "data-testid"?: string
  onDeletingChange?: (isDeleting: boolean) => void
}) => {
  const [isDeleting, setIsDeleting] = useState(false)
  const deletingRef = useRef(false)

  const handleDelete = async (id: string) => {
    if (disabled || deletingRef.current) {
      return
    }

    deletingRef.current = true
    setIsDeleting(true)
    onDeletingChange?.(true)
    await deleteLineItem(id)
      .then(() => window.location.reload())
      .catch((_err) => {
        deletingRef.current = false
        setIsDeleting(false)
        onDeletingChange?.(false)
      })
  }

  return (
    <div
      className={clx(
        "flex items-center justify-between text-small-regular",
        className,
      )}
    >
      <button
        type="button"
        data-testid={dataTestId}
        disabled={disabled || isDeleting}
        className="flex gap-x-1 text-ui-fg-subtle hover:text-ui-fg-base cursor-pointer"
        onClick={() => handleDelete(id)}
      >
        {isDeleting ? <Spinner className="animate-spin" /> : <Trash />}
        <span>{children}</span>
      </button>
    </div>
  )
}

export default DeleteButton
