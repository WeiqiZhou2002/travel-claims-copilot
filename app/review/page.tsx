import { notFound } from "next/navigation";
import ReviewWorkspace from "./workspace";
import "./review.css";
export const metadata = { title: "DP 审核工作台 · Travel Claims" };
export default function ReviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ReviewWorkspace />;
}
