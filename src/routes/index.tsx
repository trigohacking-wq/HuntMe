import { createFileRoute } from "@tanstack/react-router";
import { HuntApp } from "@/components/hunt-app";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <HuntApp />;
}
