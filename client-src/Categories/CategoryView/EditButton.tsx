import React from 'react';
import { Calendar, Mail } from 'lucide-react';
import { CategoryInterface } from '../../State/Types';
import { CategoryType } from '../../../common/ResponseTypes';

interface PropsType {
  category: CategoryInterface,
}

const EditButton: React.FC<PropsType> = ({
  category,
}) => {
  return (
    <div style={{width: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {
        category.useGoal
          ? <Calendar size={12} strokeWidth={2.5} color={category.type === CategoryType.Bill ? '#ff8f8f' : undefined} />
          : <Mail size={12} strokeWidth={2.5} />
      }
    </div>
  );
};

export default EditButton;
