import { Toaster as Sonner } from 'sonner'

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner theme="dark" {...props} />
)

export { Toaster }
