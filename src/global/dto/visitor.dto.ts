export class Visitor {
  signedIn: boolean;
  user: { id: string; name: string; email: string } | null;
  permissions: number;
  tokenAvailable: boolean;
  authorizationHeader: boolean;
}
