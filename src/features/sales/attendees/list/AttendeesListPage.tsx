import { CustomersListPage } from "@/features/customers/CustomersListPage";

export function AttendeesListPage() {
  return (
    <CustomersListPage
      title="Asistentes"
      detailTo={(email) => `/ventas/asistentes/${encodeURIComponent(email)}`}
    />
  );
}