/**
 * Modo pessoal sem autenticação: todos os treinos pertencem a um único dono,
 * identificado por este UUID fixo. As colunas `user_id` continuam no banco
 * justamente para que devolver o login mais adiante seja trocar esta constante
 * pelo id da sessão, sem migrar dado nenhum.
 */
export const OWNER_ID = "00000000-0000-0000-0000-000000000001";
