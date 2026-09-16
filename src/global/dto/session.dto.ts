/**
 * Estado da sessao, para o front decidir o que renderizar.
 *
 * Nao devolve o token em si: quem precisa dele pede em GET /auth/token.
 * Aqui vao apenas os fatos sobre ele.
 */
export class Session {
  message: string;
  user: { id: string; name: string; email: string };
  /** Quantas rotas o papel do usuario libera neste projeto. */
  permissions: number;
  /** O guard entregou o token ao handler. */
  tokenDisponivel: boolean;
  /** O header `Authorization: Bearer` chegou preenchido ao handler. */
  authorizationHeader: boolean;
}
