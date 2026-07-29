import { BrowserRouter } from "react-router-dom";
import SignIn from "./SignIn";
import AppRoutes from "./shell/AppRoutes";
import { useMe } from "./useMe";

export default function App() {
  const [me, signedOut, refetch] = useMe();

  if (me.state === "loading") return null;
  if (me.state === "out") return <SignIn onSignedIn={refetch} />;

  return (
    <BrowserRouter>
      <AppRoutes user={me.user} onSignedOut={signedOut} />
    </BrowserRouter>
  );
}
