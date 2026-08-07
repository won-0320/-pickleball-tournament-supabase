import { requireAdmin } from "@/app/actions/admin";
import AdminNav from "../AdminNav";
import UploadWizard from "./UploadWizard";

export default async function AdminUploadPage() {
  await requireAdmin();

  return (
    <main className="min-h-dvh">
      <AdminNav />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-6 text-2xl font-bold text-neutral-900">대진표 업로드</h1>
        <UploadWizard />
      </div>
    </main>
  );
}
