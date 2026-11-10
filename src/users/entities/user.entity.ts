import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  type Relation,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../common/enums/role.enum';
import { Incident } from '../../incidents/entities/incident.entity';

@Entity({
  name: 'users',
})
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 254, unique: true })
  email: string;

  // select: false -> la contraseña nunca se devuelve en las consultas normales
  @Column({ type: 'varchar', length: 255, select: false })
  password: string;

  @Column({ type: 'enum', enum: Role, default: Role.CITIZEN })
  role: Role;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    name: 'created_at',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    name: 'updated_at',
  })
  updatedAt: Date;

  @OneToMany(() => Incident, (incident) => incident.createdBy)
  reportedIncidents: Relation<Incident[]>;

  @OneToMany(() => Incident, (incident) => incident.assignedTo)
  assignedIncidents: Relation<Incident[]>;
}
