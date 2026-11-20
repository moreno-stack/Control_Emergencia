import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Token cerrado con logout. Se guarda en la base de datos para que siga
 * cerrado aunque la API se reinicie.
 */
@Entity({
  name: 'revoked_tokens',
})
export class RevokedToken {
  // Identificador único del token (claim "jti" del JWT)
  @PrimaryColumn('uuid')
  jti: string;

  // Cuando el token expira ya no hace falta guardarlo
  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    name: 'revoked_at',
  })
  revokedAt: Date;
}
