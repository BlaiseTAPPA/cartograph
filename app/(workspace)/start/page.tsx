import { Suspense } from "react";
import { AnalyseForm } from "../../../components/analyse-form";

// Where the landing page's field lands. It is protected, so a signed-out
// visitor goes through sign-in first and comes back here with the URL still in
// the query; the form then starts the analysis and moves on to it.
export default function StartPage({ searchParams }: PageProps<"/start">) {
  return (
    <Suspense fallback={null}>
      <Start searchParams={searchParams} />
    </Suspense>
  );
}

async function Start({ searchParams }: Pick<PageProps<"/start">, "searchParams">) {
  const { url } = await searchParams;
  return <AnalyseForm startWith={typeof url === "string" && url.trim() !== "" ? url : undefined} />;
}
