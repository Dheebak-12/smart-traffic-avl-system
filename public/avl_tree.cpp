//*#include <iostream>
using namespace std;
class Node{
    public:
    int data,height=0;
    Node* left;
    Node* right;
};
class AVL{
    public:
    Node* newNode(int data){
        Node* newNode = new Node();
        newNode->data = data;
        newNode->left=NULL;
        newNode->right = NULL;
        return newNode;
    }
    int height(Node* root){
        if(root==NULL)
        return -1;
        return root->height;
    }
    int balancing_factor(Node* root){
        return height(root->left)-height(root->right);
    }
    Node* rightRotate(Node* z) {
        Node* y = z->left;
        Node* t3 = y->right;
        y->right = z;
        z->left = t3;
        z->height = 1 + max(height(z->left), height(z->right));
        y->height = 1 + max(height(y->left), height(y->right));
        return y;
    }
    Node* leftRotate(Node* z) {
        Node* y = z->right;
        Node* t3 = y->left;
        y->left = z;
        z->right = t3;
        z->height = 1 + max(height(z->left), height(z->right));
        y->height = 1 + max(height(y->left), height(y->right));
        return y;
    }
    Node* insert(Node* root,int val){
        if(root==NULL)
        return newNode(val);
        if (val<root->data)
        root->left = insert(root->left,val);
        else if(val>root->data)
        root->right = insert(root->right,val);
        root->height = 1+max(height(root->left),height(root->right));
        int bf = balancing_factor(root);
        if(bf>1 && val<root->left->data)
        return rightRotate(root);
        if(bf>1 && val > root->left->data){
            root->left = leftRotate(root->left);
            return rightRotate(root);
        }
        if(bf<-1 && val > root->right->data)
        return leftRotate(root);
        if(bf<-1 && val < root->right->data){
            root->right = rightRotate(root->right);
            return leftRotate(root);
        }
        return root;
    }
    void inorder(Node* root){
        if(root==NULL)
        return;
        inorder(root->left);
        cout<<root->data<<" (h = "<<root->height<<")"<<endl;
        inorder(root->right);
    }
};
int main(){
    AVL avl;
    Node* root = avl.newNode(100);
    root=avl.insert(root,2);
    root=avl.insert(root,300);
    root=avl.insert(root,500);
    root=avl.insert(root,105);
    root=avl.insert(root,1000);
    avl.inorder(root);
    return 0;
}