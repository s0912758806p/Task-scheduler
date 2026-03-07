import { useState, forwardRef, useImperativeHandle } from 'react';
import { Form, Input, Button, Select, DatePicker, Modal, Row, Col } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../../hooks/redux';
import { addTask } from '../../store/taskSlice';
import { TaskStatus } from '../../types/task';
import './task-form.scss';

const { Option } = Select;
const { TextArea } = Input;

export interface TaskFormHandle {
  open: () => void;
}

const TaskForm = forwardRef<TaskFormHandle, {}>((_, ref) => {
  const [form] = Form.useForm();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const dispatch = useAppDispatch();
  const { activeBoardId } = useAppSelector((state) => state.board);

  const showModal = () => setIsModalVisible(true);

  useImperativeHandle(ref, () => ({ open: showModal }));

  const handleCancel = () => {
    setIsModalVisible(false);
    form.resetFields();
  };

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      dispatch(addTask({
        boardId: activeBoardId,
        title: values.title,
        description: values.description,
        status: values.status as TaskStatus,
        priority: Number(values.priority),
        dueDate: values.dueDate ? values.dueDate.valueOf() : undefined,
        tags: values.tags || [],
      }));
      setIsModalVisible(false);
      form.resetFields();
    });
  };

  return (
    <>
      <Button
        type="primary"
        onClick={showModal}
        icon={<PlusOutlined />}
        className="add-task-button"
      >
        新增任務
      </Button>

      <Modal
        title="新增任務"
        open={isModalVisible}
        onCancel={handleCancel}
        footer={null}
        className="task-form-modal"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ status: 'todo', priority: '2' }}
        >
          <Form.Item
            name="title"
            label="任務名稱"
            rules={[{ required: true, message: '請輸入任務名稱' }]}
          >
            <Input placeholder="請輸入任務名稱" />
          </Form.Item>

          <Form.Item name="description" label="任務描述">
            <TextArea rows={3} placeholder="請輸入任務描述（選填）" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="status"
                label="狀態"
                rules={[{ required: true, message: '請選擇狀態' }]}
              >
                <Select>
                  <Option value="todo">待處理</Option>
                  <Option value="in-progress">進行中</Option>
                  <Option value="done">已完成</Option>
                </Select>
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="priority"
                label="優先級"
                rules={[{ required: true, message: '請選擇優先級' }]}
              >
                <Select>
                  <Option value="0">緊急</Option>
                  <Option value="1">高</Option>
                  <Option value="2">中</Option>
                  <Option value="3">低</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="dueDate" label="截止日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item name="tags" label="標籤">
            <Select
              mode="tags"
              placeholder="輸入標籤後按 Enter 新增（選填）"
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item className="form-actions">
            <Button onClick={handleCancel} style={{ marginRight: 8 }}>
              取消
            </Button>
            <Button type="primary" htmlType="submit">
              確認添加
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
});

export default TaskForm;
