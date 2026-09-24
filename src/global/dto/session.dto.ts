export class Session {
  message: string;
  user: { id: string; name: string; email: string };
  permissions: number;
  tokenAvailable: boolean;
  authorizationHeader: boolean;
}
