import { Redirect } from "expo-router";
export default function RedirectTab() {
  return <Redirect href={{ pathname: "/", params: { tab: "1" } }} />;
}
