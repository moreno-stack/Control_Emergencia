import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Incident } from './incident.entity';
import { User } from '../../users/entities/user.entity';

/** Registro de quién creó o modificó un reporte y qué cambió. */
@Entity({
  name: 'incident_history',
})
export class IncidentHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  action: 'created' | 'updated';

  @Column({ type: 'jsonb', name: 'changed_fields', default: () => "'[]'" })
  changedFields: string[];

  @Column({ type: 'jsonb', default: () => "'{}'" })
  details: Record<string, { from: unknown; to: unknown }>;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    name: 'created_at',
  })
  createdAt: Date;

  @ManyToOne(() => Incident, (incident) => incident.history, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'incident_id' })
  incident: Relation<Incident>;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'actor_id' })
  actor: Relation<User>;
}
